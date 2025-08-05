/**
 * Front matter structure for markdown files
 */
export interface FrontMatter {
  title: string;
  excerpt?: string;
  tags?: string[];
  lang: string;
  slug: string;
  date?: string;
  author?: string;
  [key: string]: unknown;
}

/**
 * Parsed markdown file structure
 */
export interface ParsedMarkdown {
  frontMatter: FrontMatter;
  content: string;
  originalPath: string;
}

/**
 * Translation result for a single language
 */
export interface TranslationResult {
  language: string;
  translatedContent: string;
  translatedFrontMatter: FrontMatter;
  outputPath: string;
  cached?: boolean;
}

/**
 * File processing result summary
 */
export interface ProcessingResult {
  translated: number;
  skipped: number;
  errors: number;
}

/**
 * Cache entry structure
 */
export interface CacheEntry {
  hash: string;
  translations: Record<
    string,
    {
      title: string;
      excerpt?: string;
      tags?: string[];
      content: string;
    }
  >;
  timestamp: number;
}

/**
 * Processing options
 */
export interface ProcessingOptions {
  dryRun?: boolean;
  force?: boolean;
}

/**
 * DeepL language codes mapping
 */
export const DEEPL_LANGUAGE_MAP: Record<string, string> = {
  en: 'EN-US',
  'zh-cn': 'ZH',
  'zh-tw': 'ZH',
  ko: 'KO',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  it: 'IT',
  pt: 'PT-BR',
  ru: 'RU',
  ar: 'AR',
  hi: 'HI',
  id: 'ID',
  ms: 'MS',
  th: 'TH',
  vi: 'VI',
  tl: 'TL',
  tr: 'TR',
  br: 'PT-BR',
};
