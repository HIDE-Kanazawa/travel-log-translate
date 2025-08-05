import {
  DeepLClient,
  SanityArticleClient,
  extractTextsFromPortableText,
  injectTextsIntoPortableText,
  countCharactersInPortableText,
  validatePortableTextStructure,
  sanitizePortableTextBlocks,
  summarizePortableTextContent,
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
      // Fetch the source document
      const sourceDocument = await this.sanityClient.getArticle(documentId);
      if (!sourceDocument) {
        throw new Error(`Document not found: ${documentId}`);
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
        (sourceDocument.excerpt?.length || 0) +
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
      const translationStatus = await this.sanityClient.getTranslationStatus(documentId, [
        ...targetLanguages,
      ]);
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
          const errorMessage = `Failed to translate to ${language}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMessage);
          this.logger(`Translation to ${language} failed`, { error: errorMessage });
        }
      }

      // Save cache
      await this.deeplClient.saveCache();

      // Get final quota status
      const apiQuotaStatus = await this.deeplClient.getUsage();

      this.logger('Translation completed', {
        successful: results.length,
        failed: errors.length,
        totalCharactersUsed: formatCharacterCount(totalCharactersUsed),
        quotaUsed: `${apiQuotaStatus.percentage.toFixed(1)}%`,
      });

      return {
        success: errors.length === 0,
        results,
        errors,
        totalCharactersUsed,
        apiQuotaStatus,
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
      sourceDocument.excerpt || '',
      ...(sourceDocument.tags || []),
      ...extractedTexts.map(t => t.text),
    ].filter(text => text.trim().length > 0);

    // Translate all texts
    const translationResult = await this.deeplClient.translateBatch(textsToTranslate, language);

    let translationIndex = 0;
    const translatedTitle = translationResult.translations[translationIndex++];
    const translatedExcerpt = sourceDocument.excerpt
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

    // Create the translated document
    const translatedDocument: SanityArticle = {
      ...sourceDocument,
      _id: this.sanityClient.generateTranslatedId(sourceDocument._id, language),
      title: translatedTitle,
      slug: {
        _type: 'slug',
        current: this.sanityClient.generateTranslatedSlug(sourceDocument.slug.current, language),
      },
      excerpt: translatedExcerpt,
      content: translatedContent,
      lang: language,
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
        translatedExcerpt,
        translatedContent,
        translatedTags,
        language,
        false
      );
    }

    return {
      language,
      translatedDocument,
      usedCache: translationResult.usedCache.some(cached => cached),
      characterCount: translationResult.totalCharacterCount,
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
      (sourceDocument.excerpt?.length || 0) +
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
