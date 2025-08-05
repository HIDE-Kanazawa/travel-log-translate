/**
 * Content Publisher - Travel Blog Article Publishing Tool
 * 
 * A comprehensive tool for publishing markdown articles to Sanity CMS
 * with smart translation pipeline integration.
 */

export { ContentPublisher } from './content-publisher.js';
export { MarkdownParser } from './markdown-parser.js';
export { SanityPublisher } from './sanity-publisher.js';
export { FileManager } from './file-manager.js';

export type {
  ArticleFrontMatter,
  ParsedArticle,
  ArticleMetadata,
  PublishingOptions,
  PublishingResult,
  BatchPublishingResult,
  ArticleStatus,
} from './types.js';

// Re-export from shared package for convenience
export { SanityArticleClient } from 'shared';