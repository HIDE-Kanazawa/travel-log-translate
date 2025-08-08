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

      // Step 4: Publish to Sanity
      if (!this.sanityPublisher) {
        throw new Error('Sanity publisher not initialized. Cannot publish in validate-only mode.');
      }
      const publishResult = await this.sanityPublisher.publishArticle(article, options);
      
      if (!publishResult.success) {
        return publishResult;
      }

      console.log(`🚀 Published to Sanity: ${publishResult.sanityDocumentId}`);

      // Step 5: Move to published directory (unless dry run)
      if (!options.dryRun && options.moveToPublished !== false && publishResult.metadata) {
        const publishedPath = await this.fileManager.moveToPublished(
          markdownPath,
          publishResult.metadata
        );
        console.log(`📁 Moved to published directory: ${publishedPath}`);

        // Update metadata with new path
        publishResult.metadata.publishedPath = publishedPath;
      }

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
   * Check smart translation conditions for a specific document
   */
  async checkSmartTranslationConditions(documentId: string): Promise<{
    shouldTrigger: boolean;
    reason: string;
    hasImages: boolean;
    translationStatus?: any[];
    missingLanguages?: string[];
    title?: string;
    documentId: string;
  }> {
    if (!this.sanityPublisher) {
      throw new Error('Sanity publisher not initialized');
    }

    try {
      // Get the full article document from Sanity
      const article = await this.sanityPublisher.sanityClient.getArticle(documentId);
      
      if (!article) {
        return {
          shouldTrigger: false,
          reason: 'Article not found',
          hasImages: false,
          documentId,
        };
      }

      // Check if article is Japanese
      if (article.lang !== 'ja') {
        return {
          shouldTrigger: false,
          reason: `Article language is '${article.lang}', not Japanese`,
          hasImages: false,
          title: article.title,
          documentId,
        };
      }

      // Check if article has images in content
      const hasImages = article.content?.some((block: any) => block._type === 'image') || false;
      
      if (!hasImages) {
        return {
          shouldTrigger: false,
          reason: 'Article has no images',
          hasImages: false,
          title: article.title,
          documentId,
        };
      }

      // Check translation status for all target languages
      const targetLanguages = ['en', 'zh-cn', 'zh-tw', 'ko', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ar', 'hi', 'id', 'ms', 'th', 'vi', 'tl', 'tr', 'pt-br'];
      const translationStatus = await this.sanityPublisher.sanityClient.getTranslationStatus(documentId, targetLanguages as any);
      
      // Check if all translations already exist
      const allTranslated = translationStatus.every((status: any) => status.exists);
      
      if (allTranslated) {
        return {
          shouldTrigger: false,
          reason: 'All translations already exist',
          hasImages: true,
          translationStatus,
          title: article.title,
          documentId,
        };
      }

      // All conditions met - should trigger translation
      const missingLanguages = translationStatus
        .filter((status: any) => !status.exists)
        .map((status: any) => status.language);

      return {
        shouldTrigger: true,
        reason: `Smart trigger: Japanese article with images, missing ${missingLanguages.length} translations`,
        hasImages: true,
        translationStatus,
        missingLanguages,
        title: article.title,
        documentId,
      };
    } catch (error) {
      return {
        shouldTrigger: false,
        reason: `Error checking conditions: ${error instanceof Error ? error.message : String(error)}`,
        hasImages: false,
        documentId,
      };
    }
  }

  /**
   * Check smart translation conditions for all recent Japanese articles
   */
  async checkAllSmartTranslationConditions(limit = 50): Promise<{
    articles: Array<{
      shouldTrigger: boolean;
      reason: string;
      hasImages: boolean;
      translationStatus?: any[];
      missingLanguages?: string[];
      title?: string;
      documentId: string;
    }>;
    summary: {
      total: number;
      triggerable: number;
      notTriggerable: number;
    };
  }> {
    if (!this.sanityPublisher) {
      throw new Error('Sanity publisher not initialized');
    }

    try {
      // Get recent Japanese articles from Sanity
      const articles = await this.sanityPublisher.sanityClient.getJapaneseArticles(limit);
      
      const results = [];
      
      for (const article of articles) {
        const result = await this.checkSmartTranslationConditions(article._id);
        results.push(result);
      }

      const triggerable = results.filter(r => r.shouldTrigger).length;

      return {
        articles: results,
        summary: {
          total: results.length,
          triggerable,
          notTriggerable: results.length - triggerable,
        },
      };
    } catch (error) {
      throw new Error(`Failed to check smart translation conditions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Trigger smart translation for a specific document via GitHub Actions
   */
  async triggerSmartTranslation(documentId: string): Promise<{
    success: boolean;
    error?: string;
    webhookUrl?: string;
  }> {
    // This would typically call the webhook endpoint or GitHub Actions directly
    // For now, we'll simulate the webhook trigger logic
    try {
      // In a real implementation, this would make an HTTP request to the webhook
      // or directly trigger GitHub Actions via the API
      
      console.log(`🔄 Simulating webhook trigger for document ${documentId}`);
      
      // TODO: Implement actual webhook/GitHub Actions trigger
      // This could be:
      // 1. HTTP POST to webhook endpoint
      // 2. Direct GitHub Actions API call
      // 3. Message queue publish
      
      return {
        success: true,
        webhookUrl: `http://localhost:3000/webhook/sanity`, // Would be actual webhook URL
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Trigger smart translation for multiple documents
   */
  async triggerMultipleSmartTranslations(documentIds: string[]): Promise<{
    successful: number;
    failed: number;
    total: number;
    errors: string[];
  }> {
    const results = {
      successful: 0,
      failed: 0,
      total: documentIds.length,
      errors: [] as string[],
    };

    for (const documentId of documentIds) {
      try {
        const result = await this.triggerSmartTranslation(documentId);
        
        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
          results.errors.push(`${documentId}: ${result.error}`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push(`${documentId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return results;
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