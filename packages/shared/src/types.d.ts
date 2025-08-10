import { z } from 'zod';
/**
 * Supported target languages (19 languages, excluding Japanese)
 */
export declare const TARGET_LANGUAGES: readonly ["en", "es", "fr", "de", "it", "pt-br", "ru", "ko", "zh-cn", "zh-tw", "ar", "tr", "th", "nl", "pl", "sv", "da", "fi", "id"];
export type TargetLanguage = (typeof TARGET_LANGUAGES)[number];
/**
 * DeepL language code mapping
 */
export declare const DEEPL_LANGUAGE_MAP: Record<TargetLanguage, string>;
/**
 * Portable Text block types
 */
export declare const PortableTextBlockSchema: z.ZodObject<{
    _type: z.ZodString;
    _key: z.ZodOptional<z.ZodString>;
    children: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    markDefs: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    style: z.ZodOptional<z.ZodString>;
    listItem: z.ZodOptional<z.ZodString>;
    level: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    _type: string;
    _key?: string | undefined;
    children?: any[] | undefined;
    markDefs?: any[] | undefined;
    style?: string | undefined;
    listItem?: string | undefined;
    level?: number | undefined;
}, {
    _type: string;
    _key?: string | undefined;
    children?: any[] | undefined;
    markDefs?: any[] | undefined;
    style?: string | undefined;
    listItem?: string | undefined;
    level?: number | undefined;
}>;
export type PortableTextBlock = z.infer<typeof PortableTextBlockSchema>;
/**
 * Portable Text span (text node)
 */
export declare const PortableTextSpanSchema: z.ZodObject<{
    _type: z.ZodLiteral<"span">;
    _key: z.ZodOptional<z.ZodString>;
    text: z.ZodString;
    marks: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    _type: "span";
    text: string;
    _key?: string | undefined;
    marks?: string[] | undefined;
}, {
    _type: "span";
    text: string;
    _key?: string | undefined;
    marks?: string[] | undefined;
}>;
export type PortableTextSpan = z.infer<typeof PortableTextSpanSchema>;
/**
 * Sanity document reference
 */
export declare const SanityReferenceSchema: z.ZodObject<{
    _type: z.ZodLiteral<"reference">;
    _ref: z.ZodString;
    _weak: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    _type: "reference";
    _ref: string;
    _weak?: boolean | undefined;
}, {
    _type: "reference";
    _ref: string;
    _weak?: boolean | undefined;
}>;
export type SanityReference = z.infer<typeof SanityReferenceSchema>;
/**
 * Sanity image asset
 */
export declare const SanityImageSchema: z.ZodObject<{
    _type: z.ZodLiteral<"image">;
    _key: z.ZodOptional<z.ZodString>;
    asset: z.ZodObject<{
        _type: z.ZodLiteral<"reference">;
        _ref: z.ZodString;
        _weak: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        _type: "reference";
        _ref: string;
        _weak?: boolean | undefined;
    }, {
        _type: "reference";
        _ref: string;
        _weak?: boolean | undefined;
    }>;
    hotspot: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        height: z.ZodNumber;
        width: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
        height: number;
        width: number;
    }, {
        x: number;
        y: number;
        height: number;
        width: number;
    }>>;
    crop: z.ZodOptional<z.ZodObject<{
        top: z.ZodNumber;
        bottom: z.ZodNumber;
        left: z.ZodNumber;
        right: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        top: number;
        bottom: number;
        left: number;
        right: number;
    }, {
        top: number;
        bottom: number;
        left: number;
        right: number;
    }>>;
    alt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    _type: "image";
    asset: {
        _type: "reference";
        _ref: string;
        _weak?: boolean | undefined;
    };
    _key?: string | undefined;
    hotspot?: {
        x: number;
        y: number;
        height: number;
        width: number;
    } | undefined;
    crop?: {
        top: number;
        bottom: number;
        left: number;
        right: number;
    } | undefined;
    alt?: string | undefined;
}, {
    _type: "image";
    asset: {
        _type: "reference";
        _ref: string;
        _weak?: boolean | undefined;
    };
    _key?: string | undefined;
    hotspot?: {
        x: number;
        y: number;
        height: number;
        width: number;
    } | undefined;
    crop?: {
        top: number;
        bottom: number;
        left: number;
        right: number;
    } | undefined;
    alt?: string | undefined;
}>;
export type SanityImage = z.infer<typeof SanityImageSchema>;
/**
 * Sanity slug
 */
export declare const SanitySlugSchema: z.ZodObject<{
    _type: z.ZodLiteral<"slug">;
    current: z.ZodString;
}, "strip", z.ZodTypeAny, {
    _type: "slug";
    current: string;
}, {
    _type: "slug";
    current: string;
}>;
export type SanitySlug = z.infer<typeof SanitySlugSchema>;
/**
 * Sanity article document
 */
export declare const SanityArticleSchema: z.ZodObject<{
    _id: z.ZodString;
    _type: z.ZodLiteral<"article">;
    _rev: z.ZodOptional<z.ZodString>;
    _createdAt: z.ZodOptional<z.ZodString>;
    _updatedAt: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    slug: z.ZodObject<{
        _type: z.ZodLiteral<"slug">;
        current: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        _type: "slug";
        current: string;
    }, {
        _type: "slug";
        current: string;
    }>;
    content: z.ZodArray<z.ZodObject<{
        _type: z.ZodString;
        _key: z.ZodOptional<z.ZodString>;
        children: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
        markDefs: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
        style: z.ZodOptional<z.ZodString>;
        listItem: z.ZodOptional<z.ZodString>;
        level: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        _type: string;
        _key?: string | undefined;
        children?: any[] | undefined;
        markDefs?: any[] | undefined;
        style?: string | undefined;
        listItem?: string | undefined;
        level?: number | undefined;
    }, {
        _type: string;
        _key?: string | undefined;
        children?: any[] | undefined;
        markDefs?: any[] | undefined;
        style?: string | undefined;
        listItem?: string | undefined;
        level?: number | undefined;
    }>, "many">;
    lang: z.ZodString;
    publishedAt: z.ZodString;
    type: z.ZodEnum<["spot", "food", "transport", "hotel", "note"]>;
    prefecture: z.ZodString;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    placeName: z.ZodOptional<z.ZodString>;
    translationOf: z.ZodOptional<z.ZodObject<{
        _type: z.ZodLiteral<"reference">;
        _ref: z.ZodString;
        _weak: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        _type: "reference";
        _ref: string;
        _weak?: boolean | undefined;
    }, {
        _type: "reference";
        _ref: string;
        _weak?: boolean | undefined;
    }>>;
    coverImage: z.ZodOptional<z.ZodObject<{
        _type: z.ZodLiteral<"image">;
        _key: z.ZodOptional<z.ZodString>;
        asset: z.ZodObject<{
            _type: z.ZodLiteral<"reference">;
            _ref: z.ZodString;
            _weak: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        }, {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        }>;
        hotspot: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            height: z.ZodNumber;
            width: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            height: number;
            width: number;
        }, {
            x: number;
            y: number;
            height: number;
            width: number;
        }>>;
        crop: z.ZodOptional<z.ZodObject<{
            top: z.ZodNumber;
            bottom: z.ZodNumber;
            left: z.ZodNumber;
            right: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }>>;
        alt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }, {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }>>;
    mainImage: z.ZodOptional<z.ZodObject<{
        _type: z.ZodLiteral<"image">;
        _key: z.ZodOptional<z.ZodString>;
        asset: z.ZodObject<{
            _type: z.ZodLiteral<"reference">;
            _ref: z.ZodString;
            _weak: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        }, {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        }>;
        hotspot: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            height: z.ZodNumber;
            width: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            height: number;
            width: number;
        }, {
            x: number;
            y: number;
            height: number;
            width: number;
        }>>;
        crop: z.ZodOptional<z.ZodObject<{
            top: z.ZodNumber;
            bottom: z.ZodNumber;
            left: z.ZodNumber;
            right: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }>>;
        alt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }, {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }>>;
    image: z.ZodOptional<z.ZodObject<{
        _type: z.ZodLiteral<"image">;
        _key: z.ZodOptional<z.ZodString>;
        asset: z.ZodObject<{
            _type: z.ZodLiteral<"reference">;
            _ref: z.ZodString;
            _weak: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        }, {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        }>;
        hotspot: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            height: z.ZodNumber;
            width: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            height: number;
            width: number;
        }, {
            x: number;
            y: number;
            height: number;
            width: number;
        }>>;
        crop: z.ZodOptional<z.ZodObject<{
            top: z.ZodNumber;
            bottom: z.ZodNumber;
            left: z.ZodNumber;
            right: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }>>;
        alt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }, {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }>>;
    gallery: z.ZodOptional<z.ZodArray<z.ZodObject<{
        _type: z.ZodLiteral<"image">;
        _key: z.ZodOptional<z.ZodString>;
        asset: z.ZodObject<{
            _type: z.ZodLiteral<"reference">;
            _ref: z.ZodString;
            _weak: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        }, {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        }>;
        hotspot: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            height: z.ZodNumber;
            width: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            height: number;
            width: number;
        }, {
            x: number;
            y: number;
            height: number;
            width: number;
        }>>;
        crop: z.ZodOptional<z.ZodObject<{
            top: z.ZodNumber;
            bottom: z.ZodNumber;
            left: z.ZodNumber;
            right: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }, {
            top: number;
            bottom: number;
            left: number;
            right: number;
        }>>;
        alt: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }, {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    _type: "article";
    type: "spot" | "food" | "transport" | "hotel" | "note";
    slug: {
        _type: "slug";
        current: string;
    };
    _id: string;
    title: string;
    content: {
        _type: string;
        _key?: string | undefined;
        children?: any[] | undefined;
        markDefs?: any[] | undefined;
        style?: string | undefined;
        listItem?: string | undefined;
        level?: number | undefined;
    }[];
    lang: string;
    publishedAt: string;
    prefecture: string;
    image?: {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    } | undefined;
    _rev?: string | undefined;
    _createdAt?: string | undefined;
    _updatedAt?: string | undefined;
    tags?: string[] | undefined;
    placeName?: string | undefined;
    translationOf?: {
        _type: "reference";
        _ref: string;
        _weak?: boolean | undefined;
    } | undefined;
    coverImage?: {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    } | undefined;
    mainImage?: {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    } | undefined;
    gallery?: {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }[] | undefined;
}, {
    _type: "article";
    type: "spot" | "food" | "transport" | "hotel" | "note";
    slug: {
        _type: "slug";
        current: string;
    };
    _id: string;
    title: string;
    content: {
        _type: string;
        _key?: string | undefined;
        children?: any[] | undefined;
        markDefs?: any[] | undefined;
        style?: string | undefined;
        listItem?: string | undefined;
        level?: number | undefined;
    }[];
    lang: string;
    publishedAt: string;
    prefecture: string;
    image?: {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    } | undefined;
    _rev?: string | undefined;
    _createdAt?: string | undefined;
    _updatedAt?: string | undefined;
    tags?: string[] | undefined;
    placeName?: string | undefined;
    translationOf?: {
        _type: "reference";
        _ref: string;
        _weak?: boolean | undefined;
    } | undefined;
    coverImage?: {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    } | undefined;
    mainImage?: {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    } | undefined;
    gallery?: {
        _type: "image";
        asset: {
            _type: "reference";
            _ref: string;
            _weak?: boolean | undefined;
        };
        _key?: string | undefined;
        hotspot?: {
            x: number;
            y: number;
            height: number;
            width: number;
        } | undefined;
        crop?: {
            top: number;
            bottom: number;
            left: number;
            right: number;
        } | undefined;
        alt?: string | undefined;
    }[] | undefined;
}>;
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
export declare const EnvironmentConfigSchema: z.ZodObject<{
    DEEPL_API_KEY: z.ZodString;
    SANITY_PROJECT_ID: z.ZodString;
    SANITY_DATASET: z.ZodString;
    SANITY_TOKEN: z.ZodString;
    SANITY_API_VERSION: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    DEEPL_API_KEY: string;
    SANITY_PROJECT_ID: string;
    SANITY_DATASET: string;
    SANITY_TOKEN: string;
    SANITY_API_VERSION: string;
}, {
    DEEPL_API_KEY: string;
    SANITY_PROJECT_ID: string;
    SANITY_DATASET: string;
    SANITY_TOKEN: string;
    SANITY_API_VERSION?: string | undefined;
}>;
export type EnvironmentConfig = z.infer<typeof EnvironmentConfigSchema>;
//# sourceMappingURL=types.d.ts.map