import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TranslationEngine } from '../src/translation-engine';
import { DeepLClient } from 'shared/src/deepl-client';
import { SanityArticleClient } from 'shared/src/sanity-client';
import { TARGET_LANGUAGES } from 'shared/src/types';
import type { SanityArticle, TargetLanguage } from 'shared/src/types';

// Mock shared modules
vi.mock('shared/src/deepl-client');
vi.mock('shared/src/sanity-client');

describe('TranslationEngine', () => {
  let engine: TranslationEngine;
  let mockDeepL: any;
  let mockSanity: any;

  const mockConfig = {
    DEEPL_API_KEY: 'test-deepl-key',
    SANITY_PROJECT_ID: 'test-project',
    SANITY_DATASET: 'test-dataset',
    SANITY_TOKEN: 'test-token',
    SANITY_API_VERSION: '2024-01-01',
  };

  const mockArticle: SanityArticle = {
    _id: 'article-123',
    _type: 'article',
    title: 'テスト記事のタイトル',
    slug: { _type: 'slug', current: 'test-article' },
    excerpt: 'これはテスト記事の概要です。',
    content: [
      {
        _type: 'block',
        _key: 'block1',
        children: [
          {
            _type: 'span',
            _key: 'span1',
            text: 'これは日本語のテストコンテンツです。',
            marks: [],
          },
        ],
      },
    ],
    lang: 'ja',
    publishedAt: '2025-01-20T10:00:00.000Z',
    type: 'spot',
    prefecture: '東京都',
    tags: ['テスト', 'サンプル'],
    placeName: '渋谷スクランブル交差点',
  };;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock DeepL client
    mockDeepL = {
      init: vi.fn(),
      translateText: vi.fn(),
      translateBatch: vi.fn(),
      getUsage: vi.fn().mockResolvedValue({
        character_count: 1000,
        character_limit: 500000,
      }),
      clearCache: vi.fn(),
      checkCharacterLimit: vi.fn().mockResolvedValue(true),
    };

    // Mock Sanity client
    mockSanity = {
      getArticle: vi.fn(),
      translationExists: vi.fn(),
      createOrUpdateTranslation: vi.fn(),
      batchCreateTranslations: vi.fn(),
      getTranslationStatus: vi.fn(),
    };

    engine = new TranslationEngine(mockDeepL, mockSanity);
  });

  describe('translateDocument', () => {
    it('should translate document to all languages successfully', async () => {
      // Setup mocks
      mockSanity.getArticle.mockResolvedValue(mockArticle);
      mockSanity.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: false, documentId: 'article-123-en' },
        { language: 'fr', exists: false, documentId: 'article-123-fr' },
      ]);

      mockDeepL.translateBatch
        .mockResolvedValueOnce({
          translations: [
            'Test Article Title',
            'test-article',
            'Shibuya Scramble Crossing',
            'test',
            'sample',
            'This is English test content.',
          ],
          totalCharacters: 92,
          usedCache: false,
        })
        .mockResolvedValueOnce({
          translations: [
            'Titre d\'article de test',
            'article-de-test',
            'Carrefour de Shibuya Scramble',
            'test',
            'échantillon',
            'Ceci est le contenu de test français.',
          ],
          totalCharacters: 115,
          usedCache: false,
        });

      mockSanity.batchCreateTranslations.mockResolvedValue({
        successful: 2,
        failed: 0,
        skipped: 0,
        results: [
          { language: 'en', status: 'success', documentId: 'article-123-en' },
          { language: 'fr', status: 'success', documentId: 'article-123-fr' },
        ],
      });

      mockDeepL.getUsage.mockResolvedValue({
        character_count: 207,
        character_limit: 500000,
      });

      const result = await engine.translateDocument('article-123', {
        targetLanguages: ['en', 'fr'],
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.totalCharactersUsed).toBe(207);
      expect(mockSanity.getArticle).toHaveBeenCalledWith('article-123');
      expect(mockDeepL.translateBatch).toHaveBeenCalledTimes(2); // 2 languages
    });

    it('should handle document not found', async () => {
      mockSanity.getArticle.mockResolvedValue(null);

      const result = await engine.translateDocument('non-existent');

      expect(result.success).toBe(false);
      expect(result.errors).toContain('Document non-existent not found');
    });

    it('should skip existing translations when force=false', async () => {
      mockSanity.getArticle.mockResolvedValue(mockArticle);
      mockSanity.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: true, documentId: 'article-123-en' },
        { language: 'fr', exists: false, documentId: 'article-123-fr' },
      ]);

      mockDeepL.translateBatch.mockResolvedValue({
        translations: ['French Title', 'titre-francais', 'Place Name en Français', 'french', 'sample', 'French content'],
        totalCharacters: 72,
        usedCache: false,
      });

      mockSanity.batchCreateTranslations.mockResolvedValue({
        successful: 1,
        failed: 0,
        skipped: 0,
        results: [
          { language: 'fr', status: 'success', documentId: 'article-123-fr' },
        ],
      });

      mockDeepL.getUsage.mockResolvedValue({
        character_count: 72,
        character_limit: 500000,
      });

      const result = await engine.translateDocument('article-123', {
        targetLanguages: ['en', 'fr'],
        force: false,
      });

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1); // Only French translation
      expect(result.results[0].language).toBe('fr');
    });

    it('should handle dry run mode', async () => {
      mockSanity.getArticle.mockResolvedValue(mockArticle);
      mockSanity.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: false, documentId: 'article-123-en' },
      ]);

      // Dry run should still call translation API for validation
      mockDeepL.translateBatch.mockResolvedValue({
        translations: ['Test Title', 'test-title', 'Test Place Name', 'test', 'sample', 'Test content'],
        totalCharacters: 57,
        usedCache: false,
      });

      mockSanity.batchCreateTranslations.mockResolvedValue({
        successful: 1,
        failed: 0,
        skipped: 0,
        results: [
          { language: 'en', status: 'success', documentId: 'article-123-en' },
        ],
      });

      mockDeepL.getUsage.mockResolvedValue({
        character_count: 57,
        character_limit: 500000,
      });

      const result = await engine.translateDocument('article-123', {
        targetLanguages: ['en'],
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(mockSanity.batchCreateTranslations).toHaveBeenCalledWith(
        mockArticle,
        expect.any(Array),
        true // dry run flag
      );
    });

    it('should handle translation API errors gracefully', async () => {
      mockSanity.getArticle.mockResolvedValue(mockArticle);
      mockSanity.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: false, documentId: 'article-123-en' },
      ]);

      mockDeepL.translateBatch.mockRejectedValue(new Error('API quota exceeded'));

      const result = await engine.translateDocument('article-123', {
        targetLanguages: ['en'],
      });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Translation failed for en: API quota exceeded'),
        ])
      );
    });

    it('should handle partial translation failures', async () => {
      mockSanity.getArticle.mockResolvedValue(mockArticle);
      mockSanity.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: false, documentId: 'article-123-en' },
        { language: 'fr', exists: false, documentId: 'article-123-fr' },
      ]);

      // English translations succeed
      mockDeepL.translateBatch
        .mockResolvedValueOnce({
          translations: ['Title', 'title', 'Place Name', 'tag1', 'tag2', 'Content'],
          totalCharacters: 27,
          usedCache: false,
        })
        // French translations fail
        .mockRejectedValue(new Error('Translation failed'));

      mockSanity.batchCreateTranslations.mockResolvedValue({
        successful: 1,
        failed: 0,
        skipped: 0,
        results: [
          { language: 'en', status: 'success', documentId: 'article-123-en' },
        ],
      });

      mockDeepL.getUsage.mockResolvedValue({
        character_count: 27,
        character_limit: 500000,
      });

      const result = await engine.translateDocument('article-123', {
        targetLanguages: ['en', 'fr'],
      });

      expect(result.success).toBe(false); // Partial failure
      expect(result.results).toHaveLength(1); // Only English succeeded
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Translation failed for fr'),
        ])
      );
    });
  });

  describe('getTranslationStats', () => {
    it('should return translation statistics for document', async () => {
      mockSanity.getArticle.mockResolvedValue(mockArticle);
      
      // Return status for all 19 target languages  
      const allLanguageStatus = TARGET_LANGUAGES.map(lang => ({
        language: lang,
        exists: lang === 'en', // Only English exists
        documentId: `article-123-${lang}`
      }));
      
      mockSanity.getTranslationStatus.mockResolvedValue(allLanguageStatus);

      const stats = await engine.getTranslationStats('article-123');

      expect(stats.sourceDocument).toEqual(mockArticle);
      expect(stats.translationStatus).toHaveLength(19); // All target languages
      expect(stats.characterCount).toBeGreaterThan(0);
      expect(stats.estimatedCost).toBeGreaterThan(0);
    });

    it('should handle non-existent documents', async () => {
      mockSanity.getArticle.mockResolvedValue(null);

      await expect(engine.getTranslationStats('non-existent')).rejects.toThrow('Document not found');
    });
  });

  describe('error handling', () => {
    it('should handle Sanity connection errors', async () => {
      mockSanity.getArticle.mockRejectedValue(new Error('Sanity connection failed'));

      const result = await engine.translateDocument('article-123');

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Failed to fetch document'),
        ])
      );
    });

    it('should validate target languages', async () => {
      mockSanity.getArticle.mockResolvedValue(mockArticle);

      const result = await engine.translateDocument('article-123', {
        targetLanguages: ['invalid-lang'] as any,
      });

      expect(result.success).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Invalid target language'),
        ])
      );
    });
  });
});