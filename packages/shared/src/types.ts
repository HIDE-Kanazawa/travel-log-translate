import { z } from 'zod';

/**
 * Supported target languages (19 languages, excluding Japanese)
 */
export const TARGET_LANGUAGES = [
  'en',      // English (American)
  'es',      // Spanish 
  'fr',      // French
  'de',      // German
  'it',      // Italian
  'pt-br',   // Portuguese (Brazilian)
  'ru',      // Russian
  'ko',      // Korean
  'zh-cn',   // Chinese (simplified)
  'zh-tw',   // Chinese (traditional)
  'ar',      // Arabic
  'tr',      // Turkish
  'th',      // Thai
  'nl',      // Dutch
  'pl',      // Polish
  'sv',      // Swedish
  'da',      // Danish
  'fi',      // Finnish
  'id',      // Indonesian
] as const;;;;;

export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];

/**
 * DeepL language code mapping
 */
export const DEEPL_LANGUAGE_MAP: Record<TargetLanguage, string> = {
  en: 'EN-US',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  'pt-br': 'PT-BR',
  ru: 'RU',
  ko: 'KO',
  'zh-cn': 'ZH-HANS',
  'zh-tw': 'ZH-HANT',
  ar: 'AR',
  tr: 'TR',
  th: 'TH',
  nl: 'NL',
  pl: 'PL',
  sv: 'SV',
  da: 'DA',
  fi: 'FI',
  id: 'ID',
};;;;;

/**
 * Portable Text block types
 */
export const PortableTextBlockSchema = z.object({
  _type: z.string(),
  _key: z.string().optional(),
  children: z.array(z.any()).optional(),
  markDefs: z.array(z.any()).optional(),
  style: z.string().optional(),
  listItem: z.string().optional(),
  level: z.number().optional(),
});

export type PortableTextBlock = z.infer<typeof PortableTextBlockSchema>;

/**
 * Portable Text span (text node)
 */
export const PortableTextSpanSchema = z.object({
  _type: z.literal('span'),
  _key: z.string().optional(),
  text: z.string(),
  marks: z.array(z.string()).optional(),
});

export type PortableTextSpan = z.infer<typeof PortableTextSpanSchema>;

/**
 * Sanity document reference
 */
export const SanityReferenceSchema = z.object({
  _type: z.literal('reference'),
  _ref: z.string(),
  _weak: z.boolean().optional(),
});

export type SanityReference = z.infer<typeof SanityReferenceSchema>;

/**
 * Sanity image asset
 */
export const SanityImageSchema = z.object({
  _type: z.literal('image'),
  _key: z.string().optional(),
  asset: SanityReferenceSchema,
  hotspot: z
    .object({
      x: z.number(),
      y: z.number(),
      height: z.number(),
      width: z.number(),
    })
    .optional(),
  crop: z
    .object({
      top: z.number(),
      bottom: z.number(),
      left: z.number(),
      right: z.number(),
    })
    .optional(),
  alt: z.string().optional(),
});

export type SanityImage = z.infer<typeof SanityImageSchema>;

/**
 * Sanity slug
 */
export const SanitySlugSchema = z.object({
  _type: z.literal('slug'),
  current: z.string(),
});

export type SanitySlug = z.infer<typeof SanitySlugSchema>;

/**
 * Sanity article document
 */
export const SanityArticleSchema = z.object({
  _id: z.string(),
  _type: z.literal('article'),
  _rev: z.string().optional(),
  _createdAt: z.string().optional(),
  _updatedAt: z.string().optional(),
  // Required fields
  title: z.string(),
  slug: SanitySlugSchema,
  content: z.array(PortableTextBlockSchema),
  lang: z.string(),
  publishedAt: z.string(),
  type: z.enum(['spot', 'food', 'transport', 'hotel', 'note']),
  prefecture: z.string(),
  // Optional fields
  tags: z.array(z.string()).optional(),
  placeName: z.string().optional(),
  translationOf: SanityReferenceSchema.optional(),
  // Image fields
  coverImage: SanityImageSchema.optional(),
  mainImage: SanityImageSchema.optional(),
  image: SanityImageSchema.optional(),
  gallery: z.array(SanityImageSchema).optional(),
});

export type SanityArticle = z.infer<typeof SanityArticleSchema>;

/**
 * Text extraction result
 */
export interface ExtractedText {
  path: string;
  text: string;
  blockIndex: number;
  spanIndex?: number;
}

/**
 * Translation cache entry
 */
export interface TranslationCacheEntry {
  hash: string;
  sourceText: string;
  targetLanguage: TargetLanguage;
  translatedText: string;
  timestamp: number;
}

/**
 * Translation result
 */
export interface TranslationResult {
  language: TargetLanguage;
  translatedDocument: SanityArticle;
  usedCache: boolean;
  characterCount: number;
}

/**
 * DeepL usage information
 */
export interface DeepLUsage {
  characterCount: number;
  characterLimit: number;
  remaining: number;
  percentage: number;
}

/**
 * Translation options
 */
export interface TranslationOptions {
  dryRun?: boolean;
  force?: boolean;
  targetLanguages?: TargetLanguage[];
  maxCharactersPerMonth?: number;
}

/**
 * Environment configuration
 */
export const EnvironmentConfigSchema = z.object({
  DEEPL_API_KEY: z.string().min(1),
  SANITY_PROJECT_ID: z.string().min(1),
  SANITY_DATASET: z.string().min(1),
  SANITY_API_TOKEN: z.string().min(1),
  SANITY_API_VERSION: z.string().default('2024-01-01'),
});

export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;
