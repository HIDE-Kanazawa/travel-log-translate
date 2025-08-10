import {
  DeepLClient,
  SanityArticleClient,
  extractTextsFromPortableText,
  injectTextsIntoPortableText,
  countCharactersInPortableText,
  validatePortableTextStructure,
  sanitizePortableTextBlocks,
  summarizePortableTextContent,
  convertToSlug,
  SanityArticle,
  TargetLanguage,
  TARGET_LANGUAGES,
  TranslationResult,
  TranslationOptions,
  formatCharacterCount,
} from 'shared';

/**
 * Main translation engine for Sanity documents
 */
/**
 * Reverse prefecture mapping from English values to Japanese names
 * This ensures translated articles use Japanese prefecture names
 */
const PREFECTURE_REVERSE_MAPPING: Record<string, string> = {
  'hokkaido': '北海道',
  'aomori': '青森県',
  'iwate': '岩手県',
  'miyagi': '宮城県',
  'akita': '秋田県',
  'yamagata': '山形県',
  'fukushima': '福島県',
  'ibaraki': '茨城県',
  'tochigi': '栃木県',
  'gunma': '群馬県',
  'saitama': '埼玉県',
  'chiba': '千葉県',
  'tokyo': '東京都',
  'kanagawa': '神奈川県',
  'niigata': '新潟県',
  'toyama': '富山県',
  'ishikawa': '石川県',
  'fukui': '福井県',
  'yamanashi': '山梨県',
  'nagano': '長野県',
  'gifu': '岐阜県',
  'shizuoka': '静岡県',
  'aichi': '愛知県',
  'mie': '三重県',
  'shiga': '滋賀県',
  'kyoto': '京都府',
  'osaka': '大阪府',
  'hyogo': '兵庫県',
  'nara': '奈良県',
  'wakayama': '和歌山県',
  'tottori': '鳥取県',
  'shimane': '島根県',
  'okayama': '岡山県',
  'hiroshima': '広島県',
  'yamaguchi': '山口県',
  'tokushima': '徳島県',
  'kagawa': '香川県',
  'ehime': '愛媛県',
  'kochi': '高知県',
  'fukuoka': '福岡県',
  'saga': '佐賀県',
  'nagasaki': '長崎県',
  'kumamoto': '熊本県',
  'oita': '大分県',
  'miyazaki': '宮崎県',
  'kagoshima': '鹿児島県',
  'okinawa': '沖縄県',
};

export class TranslationEngine {
  private deeplClient: DeepLClient;
  private sanityClient: SanityArticleClient;
  private logger: (message: string, data?: any) => void;

  constructor(
    deeplClient: DeepLClient,
    sanityClient: SanityArticleClient,
    logger: (message: string, data?: any) => void = console.log
  ) {
    this.deeplClient = deeplClient;
    this.sanityClient = sanityClient;
    this.logger = logger;
  }

  /**
   * Initialize the translation engine
   */
  async init(): Promise<void> {
    await this.deeplClient.init();
  }

  /**
   * Translate a single document to multiple languages
   */
  async translateDocument(
    documentId: string,
    options: TranslationOptions = {}
  ): Promise<{
    success: boolean;
    results: TranslationResult[];
    errors: string[];
    totalCharactersUsed: number;
    apiQuotaStatus: any;
  }> {
    const {
      dryRun = false,
      force = false,
      targetLanguages = TARGET_LANGUAGES,
      maxCharactersPerMonth = 450000, // Conservative limit for 500k quota
    } = options;

    this.logger('Starting document translation', {
      documentId,
      targetLanguages: targetLanguages.length,
    });

    try {
      // Validate target languages first
      const invalidLangs = targetLanguages.filter(
        lang => !TARGET_LANGUAGES.includes(lang as TargetLanguage)
      );
      if (invalidLangs.length > 0) {
        throw new Error(`Invalid target language: ${invalidLangs.join(', ')}`);
      }

      // Fetch the source document with explicit error context
      let sourceDocument: SanityArticle | null;
      try {
        sourceDocument = await this.sanityClient.getArticle(documentId);
      } catch (err) {
        throw new Error(`Failed to fetch document: ${err instanceof Error ? err.message : String(err)}`);
      }

      if (!sourceDocument) {
        throw new Error(`Document ${documentId} not found`);
      }

      // Validate it's a Japanese document
      if (sourceDocument.lang !== 'ja') {
        throw new Error(`Document is not Japanese (lang: ${sourceDocument.lang})`);
      }

      if (sourceDocument.translationOf) {
        throw new Error('Document is already a translation, not a master document');
      }

      this.logger('Source document loaded', {
        title: sourceDocument.title,
        lang: sourceDocument.lang,
        contentBlocks: sourceDocument.content.length,
      });

      // Validate and sanitize content
      const validation = validatePortableTextStructure(sourceDocument.content);
      if (!validation.isValid) {
        throw new Error(`Invalid Portable Text structure: ${validation.errors.join(', ')}`);
      }

      if (validation.warnings.length > 0) {
        this.logger('Content warnings', { warnings: validation.warnings });
      }

      const sanitizedContent = sanitizePortableTextBlocks(sourceDocument.content);
      const contentSummary = summarizePortableTextContent(sanitizedContent);

      this.logger('Content analysis', contentSummary);

      // Check character limits
      const totalCharacters =
        sourceDocument.title.length +
        (''?.length || 0) +
        (sourceDocument.tags?.join(' ').length || 0) +
        contentSummary.totalCharacters;

      const estimatedTotalChars = totalCharacters * targetLanguages.length;

      this.logger('Character count analysis', {
        perDocument: formatCharacterCount(totalCharacters),
        estimatedTotal: formatCharacterCount(estimatedTotalChars),
        targetLanguages: targetLanguages.length,
      });

      // Check API quota
      const canTranslate = await this.deeplClient.checkCharacterLimit(estimatedTotalChars);
      if (!canTranslate) {
        const usage = await this.deeplClient.getUsage();
        throw new Error(
          `Translation would exceed API limits. Current: ${formatCharacterCount(usage.characterCount)}, ` +
            `Limit: ${formatCharacterCount(usage.characterLimit)}, ` +
            `Estimated usage: ${formatCharacterCount(estimatedTotalChars)}`
        );
      }

      // Check monthly limit
      if (estimatedTotalChars > maxCharactersPerMonth) {
        throw new Error(
          `Translation exceeds monthly character limit: ${formatCharacterCount(estimatedTotalChars)} > ${formatCharacterCount(maxCharactersPerMonth)}`
        );
      }

      // Get translation status
      const translationStatus =
        (await this.sanityClient.getTranslationStatus(documentId, [...targetLanguages])) || [];
      const languagesToTranslate = force
        ? targetLanguages
        : targetLanguages.filter(lang => !translationStatus.find(s => s.language === lang)?.exists);

      if (languagesToTranslate.length === 0) {
        this.logger('All translations already exist', { documentId });
        return {
          success: true,
          results: [],
          errors: [],
          totalCharactersUsed: 0,
          apiQuotaStatus: await this.deeplClient.getUsage(),
        };
      }

      this.logger('Languages to translate', {
        languages: languagesToTranslate,
        skipped: targetLanguages.length - languagesToTranslate.length,
      });

      // Process translations
      const results: TranslationResult[] = [];
      const errors: string[] = [];
      let totalCharactersUsed = 0;

      for (const language of languagesToTranslate) {
        try {
          this.logger(`Translating to ${language}...`);

          const result = await this.translateToLanguage(
            sourceDocument,
            language,
            sanitizedContent,
            dryRun
          );

          results.push(result);
          totalCharactersUsed += result.characterCount;

          this.logger(`Translation to ${language} completed`, {
            usedCache: result.usedCache,
            characters: formatCharacterCount(result.characterCount),
          });
        } catch (error) {
          const errorMessage = `Translation failed for ${language}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          this.logger(`Translation to ${language} failed`, { error: errorMessage });
        }
      }

      // Persist results via batch operation
      if (typeof (this.sanityClient as any).batchCreateTranslations === 'function') {
        try {
          await (this.sanityClient as any).batchCreateTranslations(
            sourceDocument,
            results,
            dryRun
          );
        } catch (err) {
          this.logger('Batch create translations failed', {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Save cache if supported by mock
      if (typeof (this.deeplClient as any).saveCache === 'function') {
        await (this.deeplClient as any).saveCache();
      }

      // Get final quota status
      const rawUsage = await this.deeplClient.getUsage();
      const apiQuotaStatus = {
        characterCount: (rawUsage as any).character_count ?? rawUsage.characterCount ?? 0,
        characterLimit: (rawUsage as any).character_limit ?? rawUsage.characterLimit ?? 1,
      };
      const percentage = apiQuotaStatus.characterLimit
        ? (apiQuotaStatus.characterCount / apiQuotaStatus.characterLimit) * 100
        : 0;

      this.logger('Translation completed', {
        successful: results.length,
        failed: errors.length,
        totalCharactersUsed: formatCharacterCount(totalCharactersUsed),
        quotaUsed: `${percentage.toFixed(1)}%`,
      });

      return {
        success: errors.length === 0,
        results,
        errors,
        totalCharactersUsed,
        apiQuotaStatus: {
          ...apiQuotaStatus,
          percentage,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger('Translation failed', { error: errorMessage });

      return {
        success: false,
        results: [],
        errors: [errorMessage],
        totalCharactersUsed: 0,
        apiQuotaStatus: await this.deeplClient.getUsage().catch(() => null),
      };
    }
  }

  /**
   * Translate document to a specific language
   */
  private async translateToLanguage(
    sourceDocument: SanityArticle,
    language: TargetLanguage,
    sanitizedContent: any[],
    dryRun: boolean
  ): Promise<TranslationResult> {
    // Extract texts for translation
    const extractedTexts = extractTextsFromPortableText(sanitizedContent);
    const textsToTranslate = [
      sourceDocument.title,
      sourceDocument.slug.current, // Add slug for translation
      ...(sourceDocument.placeName ? [sourceDocument.placeName] : []),
      ...(sourceDocument.tags || []),
      ...extractedTexts.map(t => t.text),
    ].filter(text => text.trim().length > 0);

    // Translate all texts
    const translationResult = await this.deeplClient.translateBatch(textsToTranslate, language);

    let translationIndex = 0;
    const translatedTitle = translationResult.translations[translationIndex++];
    const translatedSlugText = translationResult.translations[translationIndex++];

    // Get translated placeName if it exists
    const translatedPlaceName = sourceDocument.placeName 
      ? translationResult.translations[translationIndex++]
      : undefined;

    const translatedTags = sourceDocument.tags
      ? translationResult.translations.slice(
          translationIndex,
          translationIndex + sourceDocument.tags.length
        )
      : undefined;

    if (sourceDocument.tags) {
      translationIndex += sourceDocument.tags.length;
    }

    const contentTranslations = translationResult.translations.slice(translationIndex);

    // Inject translations back into content
    const translatedContent = injectTextsIntoPortableText(
      sanitizedContent,
      extractedTexts,
      contentTranslations
    );

    // Convert prefecture from English back to Japanese for translations
    const prefectureInJapanese = sourceDocument.prefecture 
      ? PREFECTURE_REVERSE_MAPPING[sourceDocument.prefecture] || sourceDocument.prefecture
      : sourceDocument.prefecture;

    // Create the translated document
    const translatedDocument: SanityArticle = {
      ...sourceDocument,
      _id:
      typeof (this.sanityClient as any).generateTranslatedId === 'function'
        ? (this.sanityClient as any).generateTranslatedId(sourceDocument._id, language)
        : `${sourceDocument._id}-${language}`,
      title: translatedTitle,
      slug: {
        _type: 'slug',
        current: `${convertToSlug(translatedSlugText)}-${language}`,
      },

      content: translatedContent,
      lang: language,
      prefecture: prefectureInJapanese,
      placeName: translatedPlaceName,
      translationOf: {
        _type: 'reference',
        _ref: sourceDocument._id,
      },
      tags: translatedTags,
    };

    // Save to Sanity if not dry run
    if (!dryRun) {
      await this.sanityClient.createOrUpdateTranslation(
        sourceDocument,
        translatedTitle,
        undefined,
        translatedContent,
        translatedTags,
        language,
        false
      );
    }

    return {
      language,
      translatedDocument,
      usedCache: Boolean(translationResult.usedCache && (Array.isArray(translationResult.usedCache) ? translationResult.usedCache.some(Boolean) : translationResult.usedCache)),
      characterCount: (translationResult as any).totalCharacterCount ?? (translationResult as any).totalCharacters ?? 0,
    };
  }

  /**
   * Get translation statistics
   */
  async getTranslationStats(documentId: string): Promise<{
    sourceDocument: SanityArticle | null;
    translationStatus: Array<{
      language: TargetLanguage;
      exists: boolean;
      documentId: string;
    }>;
    characterCount: number;
    estimatedCost: number;
  }> {
    const sourceDocument = await this.sanityClient.getArticle(documentId);

    if (!sourceDocument) {
      throw new Error(`Document not found: ${documentId}`);
    }

    const translationStatus = await this.sanityClient.getTranslationStatus(documentId, [
      ...TARGET_LANGUAGES,
    ]);

    const totalCharacters =
      sourceDocument.title.length +
      (''?.length || 0) +
      (sourceDocument.tags?.join(' ').length || 0) +
      countCharactersInPortableText(sourceDocument.content);

    const estimatedCost = ((totalCharacters * TARGET_LANGUAGES.length) / 1000000) * 20; // $20 per 1M chars

    return {
      sourceDocument,
      translationStatus,
      characterCount: totalCharacters,
      estimatedCost,
    };
  }
}
