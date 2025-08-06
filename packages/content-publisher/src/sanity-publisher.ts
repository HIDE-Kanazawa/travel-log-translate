import { SanityArticleClient, validateEnvironment } from 'shared';
import type { ParsedArticle, ArticleMetadata, PublishingOptions, PublishingResult } from './types.js';

/**
 * Sanity CMS publisher for travel blog articles
 */
export class SanityPublisher {
  public sanityClient: SanityArticleClient;

  constructor() {
    const config = validateEnvironment(process.env);
    this.sanityClient = new SanityArticleClient(config);
  }

  /**
   * Publish article to Sanity CMS
   */
  async publishArticle(
    article: ParsedArticle,
    options: PublishingOptions = {}
  ): Promise<PublishingResult> {
    try {
      // Dry run mode - validate only
      if (options.dryRun) {
        return {
          success: true,
          metadata: await this.createMetadata(article, 'dry-run-id'),
        };
      }

      // Convert markdown content to Portable Text blocks
      const portableTextBlocks = this.convertToPortableText(article.content);

      // Generate unique ID for new article
      const articleId = `article-${Date.now()}-ja`;

      // Check if article with same slug already exists
      const existingArticles = await this.sanityClient.getJapaneseArticles(1000);
      const existingDoc = existingArticles.find(doc => doc.slug.current === article.frontMatter.slug);
      
      if (existingDoc && !options.force) {
        return {
          success: false,
          error: `Article with slug "${article.frontMatter.slug}" already exists. Use --force to override.`,
        };
      }

      // Use existing document ID if forcing update
      const finalArticleId = (existingDoc && options.force) ? existingDoc._id : articleId;

      // Create the base Japanese article using the new createBaseArticle method
      const result = await this.sanityClient.createBaseArticle(
        {
          _id: finalArticleId,
          title: article.frontMatter.title,
          slug: article.frontMatter.slug,
          excerpt: article.frontMatter.excerpt,
          content: portableTextBlocks,
          tags: article.frontMatter.tags,
          publishedAt: article.frontMatter.publishedAt,
          featured: false,
          type: article.frontMatter.type,
          placeName: article.frontMatter.placeName,
          prefecture: article.frontMatter.prefecture,
        },
        options.dryRun || false
      );

      // Create metadata
      const metadata = await this.createMetadata(article, result.documentId);

      return {
        success: true,
        articleId: result.documentId,
        sanityDocumentId: result.documentId,
        metadata,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown publishing error',
      };
    }
  }


  /**
   * Convert markdown content to Portable Text blocks
   * This is a simplified implementation - could be expanded with a proper markdown parser
   */
  private convertToPortableText(content: string): any[] {
    // Split content into paragraphs
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    const blocks: any[] = [];

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i].trim();
      
      if (!paragraph) continue;

      // Handle headings
      if (paragraph.startsWith('#')) {
        const level = paragraph.match(/^#+/)?.[0].length || 1;
        const text = paragraph.replace(/^#+\s*/, '');
        
        blocks.push({
          _type: 'block',
          _key: `heading-${i}`,
          style: `h${Math.min(level, 6)}`,
          children: [
            {
              _type: 'span',
              _key: `span-${i}`,
              text,
              marks: [],
            },
          ],
        });
      }
      // Handle images
      else if (paragraph.includes('![') && paragraph.includes('](')) {
        const imageMatch = paragraph.match(/!\[(.*?)\]\((.*?)\)/);
        if (imageMatch) {
          const [, alt] = imageMatch;
          
          // For now, create a placeholder - in real implementation, 
          // you'd upload the image to Sanity and get an asset reference
          blocks.push({
            _type: 'image',
            _key: `image-${i}`,
            alt,
            asset: {
              _type: 'reference',
              _ref: 'placeholder-image-ref', // Would be actual Sanity asset reference
            },
          });
        }
      }
      // Handle regular paragraphs
      else {
        blocks.push({
          _type: 'block',
          _key: `block-${i}`,
          style: 'normal',
          children: [
            {
              _type: 'span',
              _key: `span-${i}`,
              text: paragraph,
              marks: [],
            },
          ],
        });
      }
    }

    return blocks;
  }

  /**
   * Create article metadata
   */
  private async createMetadata(
    article: ParsedArticle,
    sanityDocumentId: string
  ): Promise<ArticleMetadata> {
    const imageRefs = this.extractImageReferences(article.content);
    
    return {
      sanityDocumentId,
      title: article.frontMatter.title,
      slug: article.frontMatter.slug,
      lang: article.frontMatter.lang,
      publishedAt: new Date().toISOString(),
      originalPath: article.originalPath,
      publishedPath: '', // Will be set by file manager
      sanityUrl: `https://studio.sanity.io/desk/article;${sanityDocumentId}`,
      translationStatus: {
        pending: true,
        completed: false,
        languages: [],
      },
      images: {
        hasImages: imageRefs.length > 0,
        count: imageRefs.length,
        assets: imageRefs,
      },
      stats: {
        contentLength: article.contentLength,
        publishedAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
    };
  }

  /**
   * Extract image references from content
   */
  private extractImageReferences(content: string): string[] {
    const imageRegex = /!\[.*?\]\(([^)]+)\)/g;
    const images: string[] = [];
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      images.push(match[1]);
    }

    return images;
  }

  /**
   * Get article status from Sanity
   */
  async getArticleStatus(documentId: string): Promise<ArticleMetadata | null> {
    try {
      const document = await this.sanityClient.getArticle(documentId);
      
      if (!document) return null;

      // Get translation status
      const TARGET_LANGUAGES: any[] = ['en', 'zh-cn', 'zh-tw', 'ko', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ar', 'hi', 'id', 'ms', 'th', 'vi', 'tl', 'tr', 'br'];
      const translationStatus = await this.sanityClient.getTranslationStatus(documentId, TARGET_LANGUAGES);
      
      return {
        sanityDocumentId: document._id,
        title: document.title,
        slug: document.slug.current,
        lang: document.lang,
        publishedAt: document.publishedAt || '',
        originalPath: '', // Not stored in Sanity
        publishedPath: '', // Not stored in Sanity
        sanityUrl: `https://studio.sanity.io/desk/article;${document._id}`,
        translationStatus: {
          pending: !translationStatus.every((t: any) => t.exists),
          completed: translationStatus.every((t: any) => t.exists),
          languages: translationStatus.filter((t: any) => t.exists).map((t: any) => t.language),
        },
        images: {
          hasImages: document.content?.some((block: any) => block._type === 'image') || false,
          count: document.content?.filter((block: any) => block._type === 'image').length || 0,
          assets: [],
        },
        stats: {
          contentLength: 0, // Would need to calculate from Portable Text
          publishedAt: document.publishedAt || '',
          lastModified: document._updatedAt || '',
        },
      };
    } catch {
      return null;
    }
  }
}