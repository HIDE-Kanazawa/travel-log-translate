import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { TranslationService } from './translation';
import { Cache } from './cache';
import { Logger } from '../utils/logger';
import { generateContentHash, generateSlugWithLang, translateTags } from '../utils/hash';
import {
  FrontMatter,
  ParsedMarkdown,
  TranslationResult,
  ProcessingResult,
  ProcessingOptions,
} from '../types/index';

/**
 * File processor for markdown translation
 */
export class FileProcessor {
  constructor(
    private translationService: TranslationService,
    private cache: Cache,
    private logger: Logger
  ) {}

  /**
   * Process a single markdown file for translation
   */
  async processFile(
    filePath: string,
    targetLanguages: string[],
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const fileName = path.basename(filePath);
    this.logger.info('Processing file', { file: fileName });

    // Initialize cache
    await this.cache.init();

    // Parse the markdown file
    const parsed = await this.parseMarkdownFile(filePath);

    // Validate that this is a Japanese file
    if (parsed.frontMatter.lang !== 'ja') {
      this.logger.warn('Skipping non-Japanese file', {
        file: fileName,
        lang: parsed.frontMatter.lang,
      });
      return { translated: 0, skipped: 1, errors: 0 };
    }

    // Check content length limit (15,000 characters)
    const contentLength =
      parsed.content.length +
      (parsed.frontMatter.title?.length || 0) +
      (parsed.frontMatter.excerpt?.length || 0);
    if (contentLength > 15000) {
      this.logger.error('Content exceeds 15,000 character limit', {
        file: fileName,
        length: contentLength,
        limit: 15000,
      });
      return { translated: 0, skipped: 0, errors: 1 };
    }

    // Check DeepL quota before proceeding
    const canTranslate = await this.translationService.checkCharacterLimit(
      contentLength * targetLanguages.length
    );
    if (!canTranslate) {
      this.logger.error('DeepL character limit would be exceeded', {
        file: fileName,
        estimatedChars: contentLength * targetLanguages.length,
      });
      return { translated: 0, skipped: 0, errors: 1 };
    }

    // Generate content hash for caching
    const contentHash = generateContentHash(parsed.content, parsed.frontMatter);

    let translated = 0;
    let skipped = 0;
    let errors = 0;

    // Process each target language
    for (const targetLang of targetLanguages) {
      try {
        const result = await this.translateToLanguage(parsed, targetLang, contentHash, options);

        if (result) {
          if (result.cached) {
            this.logger.info('Used cached translation', {
              file: fileName,
              language: targetLang,
              output: path.basename(result.outputPath),
            });
            skipped++;
          } else {
            this.logger.info('Created new translation', {
              file: fileName,
              language: targetLang,
              output: path.basename(result.outputPath),
            });
            translated++;
          }

          // Write the translated file unless it's a dry run
          if (!options.dryRun) {
            await this.writeTranslatedFile(result);
          }
        } else {
          skipped++;
        }
      } catch (error) {
        this.logger.error('Translation failed', {
          file: fileName,
          language: targetLang,
          error: error instanceof Error ? error.message : String(error),
        });
        errors++;
      }
    }

    // Save cache after processing
    if (!options.dryRun) {
      await this.cache.save();
    }

    return { translated, skipped, errors };
  }

  /**
   * Parse markdown file with front matter
   */
  private async parseMarkdownFile(filePath: string): Promise<ParsedMarkdown> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = matter(content);

      const frontMatter = parsed.data as FrontMatter;

      // Validate required fields
      if (!frontMatter.title) {
        throw new Error('Missing required field: title');
      }
      if (!frontMatter.lang) {
        throw new Error('Missing required field: lang');
      }
      if (!frontMatter.slug) {
        throw new Error('Missing required field: slug');
      }

      return {
        frontMatter,
        content: parsed.content,
        originalPath: filePath,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse markdown file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Translate content to a specific language
   */
  private async translateToLanguage(
    parsed: ParsedMarkdown,
    targetLang: string,
    contentHash: string,
    options: ProcessingOptions
  ): Promise<TranslationResult | null> {
    const outputPath = this.generateOutputPath(
      parsed.originalPath,
      parsed.frontMatter.slug,
      targetLang
    );

    // Check if output file already exists and we're not forcing
    if (!options.force) {
      try {
        await fs.access(outputPath);
        return null; // File exists, skip
      } catch {
        // File doesn't exist, proceed with translation
      }
    }

    // Check cache first (unless forcing)
    if (!options.force) {
      const cached = this.cache.get(contentHash, targetLang);
      if (cached) {
        return {
          language: targetLang,
          translatedContent: cached.content,
          translatedFrontMatter: {
            ...parsed.frontMatter,
            title: cached.title,
            excerpt: cached.excerpt,
            tags: cached.tags,
            lang: targetLang,
            slug: generateSlugWithLang(parsed.frontMatter.slug, targetLang),
          },
          outputPath,
          cached: true,
        };
      }
    }

    // Prepare texts for batch translation
    const textsToTranslate: string[] = [parsed.frontMatter.title, parsed.content];

    if (parsed.frontMatter.excerpt) {
      textsToTranslate.push(parsed.frontMatter.excerpt);
    }

    if (parsed.frontMatter.tags && parsed.frontMatter.tags.length > 0) {
      textsToTranslate.push(...parsed.frontMatter.tags);
    }

    // Translate all texts in batch
    const translations = await this.translationService.translateBatch(textsToTranslate, targetLang);

    let index = 0;
    const translatedTitle = translations[index++];
    const translatedContent = translations[index++];
    const translatedExcerpt = parsed.frontMatter.excerpt ? translations[index++] : undefined;
    const translatedTags = parsed.frontMatter.tags
      ? translateTags(
          parsed.frontMatter.tags,
          translations.slice(index, index + parsed.frontMatter.tags.length)
        )
      : undefined;

    // Create translated front matter
    const translatedFrontMatter: FrontMatter = {
      ...parsed.frontMatter,
      title: translatedTitle,
      excerpt: translatedExcerpt,
      tags: translatedTags,
      lang: targetLang,
      slug: generateSlugWithLang(parsed.frontMatter.slug, targetLang),
    };

    // Cache the translation
    this.cache.set(contentHash, targetLang, {
      title: translatedTitle,
      excerpt: translatedExcerpt,
      tags: translatedTags,
      content: translatedContent,
    });

    return {
      language: targetLang,
      translatedContent,
      translatedFrontMatter,
      outputPath,
      cached: false,
    };
  }

  /**
   * Generate output file path for translated content
   */
  private generateOutputPath(
    originalPath: string,
    originalSlug: string,
    targetLang: string
  ): string {
    const dir = path.dirname(originalPath);
    const langDir = path.join(dir, targetLang);
    const newSlug = generateSlugWithLang(originalSlug, targetLang);
    return path.join(langDir, `${newSlug}.md`);
  }

  /**
   * Write translated content to file
   */
  private async writeTranslatedFile(result: TranslationResult): Promise<void> {
    try {
      // Ensure output directory exists
      await fs.mkdir(path.dirname(result.outputPath), { recursive: true });

      // Create markdown with front matter
      const frontMatterString = matter.stringify(
        result.translatedContent,
        result.translatedFrontMatter
      );

      // Write to file
      await fs.writeFile(result.outputPath, frontMatterString, 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to write translated file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
