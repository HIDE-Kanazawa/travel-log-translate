import { SanityArticleClient, validateEnvironment } from 'shared';
import type { ParsedArticle, ArticleMetadata, PublishingOptions, PublishingResult } from './types.js';

/**
 * Sanity CMS publisher for travel blog articles
 */
/**
 * Prefecture mapping from Japanese names to Sanity values
 */
const PREFECTURE_MAPPING: Record<string, string> = {
  '北海道': 'hokkaido',
  '青森県': 'aomori',
  '岩手県': 'iwate',
  '宮城県': 'miyagi',
  '秋田県': 'akita',
  '山形県': 'yamagata',
  '福島県': 'fukushima',
  '茨城県': 'ibaraki',
  '栃木県': 'tochigi',
  '群馬県': 'gunma',
  '埼玉県': 'saitama',
  '千葉県': 'chiba',
  '東京都': 'tokyo',
  '神奈川県': 'kanagawa',
  '新潟県': 'niigata',
  '富山県': 'toyama',
  '石川県': 'ishikawa',
  '福井県': 'fukui',
  '山梨県': 'yamanashi',
  '長野県': 'nagano',
  '岐阜県': 'gifu',
  '静岡県': 'shizuoka',
  '愛知県': 'aichi',
  '三重県': 'mie',
  '滋賀県': 'shiga',
  '京都府': 'kyoto',
  '大阪府': 'osaka',
  '兵庫県': 'hyogo',
  '奈良県': 'nara',
  '和歌山県': 'wakayama',
  '鳥取県': 'tottori',
  '島根県': 'shimane',
  '岡山県': 'okayama',
  '広島県': 'hiroshima',
  '山口県': 'yamaguchi',
  '徳島県': 'tokushima',
  '香川県': 'kagawa',
  '愛媛県': 'ehime',
  '高知県': 'kochi',
  '福岡県': 'fukuoka',
  '佐賀県': 'saga',
  '長崎県': 'nagasaki',
  '熊本県': 'kumamoto',
  '大分県': 'oita',
  '宮崎県': 'miyazaki',
  '鹿児島県': 'kagoshima',
  '沖縄県': 'okinawa',
};

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

      // Convert prefecture from Japanese name to Sanity value
      const prefectureValue = PREFECTURE_MAPPING[article.frontMatter.prefecture] || article.frontMatter.prefecture;

      // Create the base Japanese article using the new createBaseArticle method
      const result = await this.sanityClient.createBaseArticle(
        {
          _id: finalArticleId,
          title: article.frontMatter.title,
          slug: article.frontMatter.slug,
          content: portableTextBlocks,
          publishedAt: article.frontMatter.publishedAt,
          type: article.frontMatter.type,
          prefecture: prefectureValue,
          // Optional fields
          tags: article.frontMatter.tags,
          placeName: article.frontMatter.placeName,
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
    const lines = content.split('\n').filter(line => line.trim());
    const blocks: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) continue;

      // Handle headings
      if (line.startsWith('#')) {
        const level = line.match(/^#+/)?.[0].length || 1;
        const text = line.replace(/^#+\s*/, '');
        
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
      // Handle list items
      else if (line.startsWith('- ')) {
        const text = line.replace(/^-\s*/, '');
        
        blocks.push({
          _type: 'block',
          _key: `list-${i}`,
          style: 'normal',
          listItem: 'bullet',
          level: 1,
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
      else if (line.includes('![') && line.includes('](')) {
        const imageMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
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
              text: line,
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
      const TARGET_LANGUAGES: any[] = ['en', 'zh-cn', 'zh-tw', 'ko', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ar', 'hi', 'id', 'ms', 'th', 'vi', 'tl', 'tr', 'pt-br'];
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