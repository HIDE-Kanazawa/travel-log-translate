import { z } from 'zod';

/**
 * Front-matter schema for travel blog articles
 */
export const ArticleFrontMatterSchema = z.object({
  // Required fields
  title: z.string().min(1, 'Title is required'),
  lang: z.literal('ja', {
    errorMap: () => ({ message: 'Language must be "ja" (Japanese)' }),
  }),
  slug: z.string().min(1, 'Slug is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  type: z.enum(['spot', 'food', 'transport', 'hotel', 'note'], {
    errorMap: () => ({ message: 'Type must be one of: spot, food, transport, hotel, note' }),
  }),
  prefecture: z.string().min(1, 'Prefecture is required'),
  publishedAt: z.string().datetime({ message: 'Published date must be in ISO format' }),
  // Optional fields
  tags: z.array(z.string()).optional(),
  placeName: z.string().optional(),
});

export type ArticleFrontMatter = z.infer<typeof ArticleFrontMatterSchema>;

/**
 * Parsed markdown article
 */
export interface ParsedArticle {
  frontMatter: ArticleFrontMatter;
  content: string;
  originalPath: string;
  contentLength: number;
}

/**
 * Article metadata stored after publishing
 */
export interface ArticleMetadata {
  sanityDocumentId: string;
  title: string;
  slug: string;
  lang: string;
  publishedAt: string;
  originalPath: string;
  publishedPath: string;
  sanityUrl?: string;
  vercelUrl?: string;
  translationStatus: {
    pending: boolean;
    completed: boolean;
    languages: string[];
  };
  images: {
    hasImages: boolean;
    count: number;
    assets: string[];
  };
  stats: {
    contentLength: number;
    publishedAt: string;
    lastModified: string;
  };
}

/**
 * Publishing options
 */
export interface PublishingOptions {
  dryRun?: boolean;
  force?: boolean;
  moveToPublished?: boolean;
  validateOnly?: boolean;
}

/**
 * Publishing result
 */
export interface PublishingResult {
  success: boolean;
  articleId?: string;
  sanityDocumentId?: string;
  metadata?: ArticleMetadata;
  error?: string;
  warnings?: string[];
}

/**
 * Batch publishing result
 */
export interface BatchPublishingResult {
  total: number;
  successful: number;
  failed: number;
  results: PublishingResult[];
  errors: string[];
}

/**
 * Article status for listing
 */
export interface ArticleStatus {
  path: string;
  title: string;
  slug: string;
  status: 'ready' | 'published' | 'error';
  lastModified: string;
  sanityDocumentId?: string;
  translationProgress?: {
    completed: number;
    total: number;
    languages: string[];
  };
}