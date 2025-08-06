import { createClient, SanityClient } from '@sanity/client';
import { SanityArticle, SanityArticleSchema, TargetLanguage, EnvironmentConfig } from './types.js';

/**
 * Sanity client wrapper for article operations
 */
export class SanityArticleClient {
  private client: SanityClient;

  constructor(config: EnvironmentConfig) {
    this.client = createClient({
      projectId: config.SANITY_PROJECT_ID,
      dataset: config.SANITY_DATASET,
      token: config.SANITY_TOKEN,
      apiVersion: config.SANITY_API_VERSION,
      useCdn: false, // We need fresh data for mutations
    });
  }

  /**
   * Fetch a single article by ID
   */
  async getArticle(documentId: string): Promise<SanityArticle | null> {
    try {
      const document = await this.client.getDocument(documentId);

      if (!document) {
        return null;
      }

      // Validate document structure
      const result = SanityArticleSchema.safeParse(document);
      if (!result.success) {
        throw new Error(`Invalid document structure: ${result.error.message}`);
      }

      return result.data;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Document not found')) {
        return null;
      }
      throw new Error(
        `Failed to fetch article: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if a translated document already exists
   */
  async translationExists(baseDocumentId: string, language: TargetLanguage): Promise<boolean> {
    const translatedId = `${baseDocumentId}-${language}`;

    try {
      const doc = await this.client.getDocument(translatedId);
      return doc !== null;
    } catch {
      return false;
    }
  }

  /**
   * Generate translated document ID
   */
  generateTranslatedId(baseDocumentId: string, language: TargetLanguage): string {
    return `${baseDocumentId}-${language}`;
  }

  /**
   * Generate translated slug
   */
  generateTranslatedSlug(originalSlug: string, language: TargetLanguage): string {
    // Remove any existing language suffix
    const baseSlug = originalSlug.replace(/-[a-z]{2}(-[a-z]{2})?$/, '');
    return `${baseSlug}-${language}`;
  }

  /**
   * Create or update a translated document
   */
  async createOrUpdateTranslation(
    baseDocument: SanityArticle,
    translatedTitle: string,
    translatedExcerpt: string | undefined,
    translatedContent: any[],
    translatedTags: string[] | undefined,
    language: TargetLanguage,
    dryRun = false
  ): Promise<{
    documentId: string;
    wasCreated: boolean;
    operation: 'create' | 'update' | 'skip';
  }> {
    const translatedId = this.generateTranslatedId(baseDocument._id, language);
    const translatedSlug = this.generateTranslatedSlug(baseDocument.slug.current, language);

    // Check if document already exists
    const existingDoc = await this.translationExists(baseDocument._id, language);

    if (existingDoc) {
      return {
        documentId: translatedId,
        wasCreated: false,
        operation: 'skip',
      };
    }

    // Prepare the translated document
    const translatedDoc: Partial<SanityArticle> = {
      _id: translatedId,
      _type: 'article',
      title: translatedTitle,
      slug: {
        _type: 'slug',
        current: translatedSlug,
      },
      excerpt: translatedExcerpt,
      content: translatedContent,
      lang: language,
      translationOf: {
        _type: 'reference',
        _ref: baseDocument._id,
      },
      tags: translatedTags,
      // Copy non-translatable fields
      publishedAt: baseDocument.publishedAt,
      author: baseDocument.author,
      featured: baseDocument.featured,
      // Copy image fields (Cover Image, Gallery, etc.)
      ...(baseDocument.coverImage && { coverImage: baseDocument.coverImage }),
      ...(baseDocument.mainImage && { mainImage: baseDocument.mainImage }),
      ...(baseDocument.image && { image: baseDocument.image }),
      ...(baseDocument.gallery && { gallery: baseDocument.gallery }),
    };

    if (dryRun) {
      console.log(`[DRY RUN] Would create translated document: ${translatedId}`);
      return {
        documentId: translatedId,
        wasCreated: true,
        operation: 'create',
      };
    }

    try {
      // Use createIfNotExists to avoid conflicts
      await this.client.createIfNotExists(translatedDoc as any);

      return {
        documentId: translatedId,
        wasCreated: true,
        operation: 'create',
      };
    } catch (error) {
      throw new Error(
        `Failed to create translation: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create a new Japanese base article
   */
  async createBaseArticle(
    article: {
      _id: string;
      title: string;
      slug: string;
      excerpt: string;
      content: any[];
      tags: string[];
      publishedAt?: string;
      author?: { _type: 'reference'; _ref: string };
      featured?: boolean;
      type?: string;
      placeName?: string;
      prefecture?: string;
    },
    dryRun = false
  ): Promise<{
    documentId: string;
    wasCreated: boolean;
    operation: 'create' | 'update' | 'skip';
  }> {
    // Check if document already exists
    const existingDoc = await this.getArticle(article._id);

    if (existingDoc) {
      return {
        documentId: article._id,
        wasCreated: false,
        operation: 'skip',
      };
    }

    // Prepare the base document
    const baseDoc: Partial<SanityArticle> = {
      _id: article._id,
      _type: 'article',
      title: article.title,
      slug: {
        _type: 'slug',
        current: article.slug,
      },
      excerpt: article.excerpt,
      content: article.content,
      lang: 'ja',
      tags: article.tags,
      publishedAt: article.publishedAt || new Date().toISOString(),
      featured: article.featured || false,
    };

    // Add optional fields if provided
    if (article.author) {
      baseDoc.author = article.author;
    }
    
    // Add custom fields that might be in Sanity schema
    if (article.type) {
      (baseDoc as any).type = article.type;
    }
    
    if (article.placeName) {
      (baseDoc as any).placeName = article.placeName;
    }
    
    if (article.prefecture) {
      (baseDoc as any).prefecture = article.prefecture;
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would create base article: ${article._id}`);
      return {
        documentId: article._id,
        wasCreated: true,
        operation: 'create',
      };
    }

    try {
      // Use createIfNotExists to avoid conflicts
      await this.client.createIfNotExists(baseDoc as any);

      return {
        documentId: article._id,
        wasCreated: true,
        operation: 'create',
      };
    } catch (error) {
      throw new Error(
        `Failed to create base article: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get all Japanese articles (master documents)
   */
  async getJapaneseArticles(limit = 100): Promise<SanityArticle[]> {
    const query = `
      *[_type == "article" && lang == "ja" && !defined(translationOf)] 
      | order(_updatedAt desc) 
      [0...${limit}]
    `;

    try {
      const documents = await this.client.fetch(query);

      return documents
        .map((doc: any) => {
          const result = SanityArticleSchema.safeParse(doc);
          if (!result.success) {
            console.warn(`Invalid document structure for ${doc._id}: ${result.error.message}`);
            return null;
          }
          return result.data;
        })
        .filter(Boolean);
    } catch (error) {
      throw new Error(
        `Failed to fetch Japanese articles: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get translation status for a document
   */
  async getTranslationStatus(
    baseDocumentId: string,
    languages: TargetLanguage[]
  ): Promise<
    {
      language: TargetLanguage;
      exists: boolean;
      documentId: string;
    }[]
  > {
    const checks = await Promise.all(
      languages.map(async language => ({
        language,
        exists: await this.translationExists(baseDocumentId, language),
        documentId: this.generateTranslatedId(baseDocumentId, language),
      }))
    );

    return checks;
  }

  /**
   * Delete a translated document
   */
  async deleteTranslation(baseDocumentId: string, language: TargetLanguage): Promise<boolean> {
    const translatedId = this.generateTranslatedId(baseDocumentId, language);

    try {
      await this.client.delete(translatedId);
      return true;
    } catch (error) {
      console.warn(`Failed to delete translation ${translatedId}:`, error);
      return false;
    }
  }

  /**
   * Batch create multiple translations
   */
  async batchCreateTranslations(
    baseDocument: SanityArticle,
    translations: {
      language: TargetLanguage;
      title: string;
      excerpt?: string;
      content: any[];
      tags?: string[];
    }[],
    dryRun = false
  ): Promise<{
    successful: number;
    failed: number;
    skipped: number;
    results: Array<{
      language: TargetLanguage;
      status: 'success' | 'failed' | 'skipped';
      documentId: string;
      error?: string;
    }>;
  }> {
    const results = await Promise.all(
      translations.map(async translation => {
        try {
          const result = await this.createOrUpdateTranslation(
            baseDocument,
            translation.title,
            translation.excerpt,
            translation.content,
            translation.tags,
            translation.language,
            dryRun
          );

          return {
            language: translation.language,
            status: result.operation === 'skip' ? ('skipped' as const) : ('success' as const),
            documentId: result.documentId,
          };
        } catch (error) {
          return {
            language: translation.language,
            status: 'failed' as const,
            documentId: this.generateTranslatedId(baseDocument._id, translation.language),
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    const successful = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;

    return {
      successful,
      failed,
      skipped,
      results,
    };
  }

  /**
   * Test connection to Sanity
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.fetch('count(*)');
      return true;
    } catch {
      return false;
    }
  }
}
