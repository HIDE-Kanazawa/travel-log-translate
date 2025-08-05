import { MarkdownParser } from './markdown-parser.js';
import { SanityPublisher } from './sanity-publisher.js';
import { FileManager } from './file-manager.js';
import type {
  PublishingOptions,
  PublishingResult,
  BatchPublishingResult,
  ArticleStatus,
  ArticleMetadata,
} from './types.js';

/**
 * Main content publisher class - orchestrates the entire publishing workflow
 */
export class ContentPublisher {
  private markdownParser: MarkdownParser;
  private sanityPublisher?: SanityPublisher;
  private fileManager: FileManager;

  constructor(options: { contentDir?: string; validateOnly?: boolean } = {}) {
    this.markdownParser = new MarkdownParser();
    
    // Only initialize SanityPublisher if not in validate-only mode
    if (!options.validateOnly) {
      this.sanityPublisher = new SanityPublisher();
    }
    
    this.fileManager = new FileManager(options.contentDir);
  }

  /**
   * Publish a single article
   */
  async publishArticle(
    markdownPath: string,
    options: PublishingOptions = {}
  ): Promise<PublishingResult> {
    try {
      console.log(`📝 Processing article: ${markdownPath}`);

      // Step 1: Parse and validate markdown
      const article = await this.markdownParser.parseFile(markdownPath);
      console.log(`✅ Parsed article: "${article.frontMatter.title}"`);

      // Step 2: Check slug uniqueness (unless forcing)
      if (!options.force) {
        const existingArticle = await this.fileManager.findArticleBySlug(
          article.frontMatter.slug
        );
        if (existingArticle) {
          return {
            success: false,
            error: `Article with slug "${article.frontMatter.slug}" already exists at ${existingArticle.path}. Use --force to override.`,
          };
        }
      }

      // Step 3: Validate only mode
      if (options.validateOnly) {
        console.log(`✅ Validation successful for "${article.frontMatter.title}"`);
        return {
          success: true,
          metadata: await this.createPreviewMetadata(article),
        };
      }

      // Step 4: Create backup before publishing
      if (!options.dryRun) {
        await this.fileManager.createBackup(markdownPath);
        console.log(`💾 Created backup of ${markdownPath}`);
      }

      // Step 5: Publish to Sanity
      if (!this.sanityPublisher) {
        throw new Error('Sanity publisher not initialized. Cannot publish in validate-only mode.');
      }
      const publishResult = await this.sanityPublisher.publishArticle(article, options);
      
      if (!publishResult.success) {
        return publishResult;
      }

      console.log(`🚀 Published to Sanity: ${publishResult.sanityDocumentId}`);

      // Step 6: Move to published directory (unless dry run)
      if (!options.dryRun && options.moveToPublished !== false && publishResult.metadata) {
        const publishedPath = await this.fileManager.moveToPublished(
          markdownPath,
          publishResult.metadata
        );
        console.log(`📁 Moved to published directory: ${publishedPath}`);

        // Update metadata with new path
        publishResult.metadata.publishedPath = publishedPath;
      }

      // Step 7: Clean old backups
      await this.fileManager.cleanOldBackups();

      console.log(`✨ Successfully published "${article.frontMatter.title}"`);

      return publishResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to publish article: ${errorMessage}`);
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Publish multiple articles in batch
   */
  async batchPublish(
    markdownPaths: string[],
    options: PublishingOptions = {}
  ): Promise<BatchPublishingResult> {
    console.log(`📚 Starting batch publish of ${markdownPaths.length} articles`);

    const results: PublishingResult[] = [];
    const errors: string[] = [];
    let successful = 0;
    let failed = 0;

    for (const markdownPath of markdownPaths) {
      try {
        const result = await this.publishArticle(markdownPath, options);
        results.push(result);

        if (result.success) {
          successful++;
        } else {
          failed++;
          if (result.error) {
            errors.push(`${markdownPath}: ${result.error}`);
          }
        }
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${markdownPath}: ${errorMessage}`);
        
        results.push({
          success: false,
          error: errorMessage,
        });
      }

      // Add delay between articles to avoid overwhelming APIs
      if (!options.dryRun && markdownPaths.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`📊 Batch publish completed: ${successful} successful, ${failed} failed`);

    return {
      total: markdownPaths.length,
      successful,
      failed,
      results,
      errors,
    };
  }

  /**
   * Get publishing status of all articles
   */
  async getStatus(): Promise<{
    ready: ArticleStatus[];
    published: ArticleStatus[];
    summary: {
      totalReady: number;
      totalPublished: number;
      totalTranslationsPending: number;
      totalTranslationsCompleted: number;
    };
  }> {
    const ready = await this.fileManager.listReadyArticles();
    const published = await this.fileManager.listPublishedArticles();

    const totalTranslationsPending = published.filter(
      article => article.translationProgress && 
      article.translationProgress.completed < article.translationProgress.total
    ).length;

    const totalTranslationsCompleted = published.filter(
      article => article.translationProgress && 
      article.translationProgress.completed === article.translationProgress.total
    ).length;

    return {
      ready,
      published,
      summary: {
        totalReady: ready.length,
        totalPublished: published.length,
        totalTranslationsPending,
        totalTranslationsCompleted,
      },
    };
  }

  /**
   * Get article metadata by document ID
   */
  async getArticleMetadata(documentId: string): Promise<ArticleMetadata | null> {
    // Try file manager first (local metadata)
    const localMetadata = await this.fileManager.getArticleMetadata(documentId);
    if (localMetadata) return localMetadata;

    // Fall back to Sanity (remote metadata)
    if (!this.sanityPublisher) {
      return null; // Cannot access Sanity in validate-only mode
    }
    return this.sanityPublisher.getArticleStatus(documentId);
  }

  /**
   * Validate multiple markdown files
   */
  async validateFiles(markdownPaths: string[]): Promise<{
    valid: number;
    invalid: number;
    results: { path: string; valid: boolean; error?: string }[];
  }> {
    const results: { path: string; valid: boolean; error?: string }[] = [];

    for (const markdownPath of markdownPaths) {
      try {
        await this.markdownParser.parseFile(markdownPath);
        results.push({ path: markdownPath, valid: true });
      } catch (error) {
        results.push({
          path: markdownPath,
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    const valid = results.filter(r => r.valid).length;
    const invalid = results.filter(r => !r.valid).length;

    return { valid, invalid, results };
  }

  /**
   * Create preview metadata for validation/dry-run
   */
  private async createPreviewMetadata(article: any): Promise<ArticleMetadata> {
    return {
      sanityDocumentId: 'preview-mode',
      title: article.frontMatter.title,
      slug: article.frontMatter.slug,
      lang: article.frontMatter.lang,
      publishedAt: new Date().toISOString(),
      originalPath: article.originalPath,
      publishedPath: '',
      translationStatus: {
        pending: true,
        completed: false,
        languages: [],
      },
      images: {
        hasImages: false,
        count: 0,
        assets: [],
      },
      stats: {
        contentLength: article.contentLength,
        publishedAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
    };
  }
}