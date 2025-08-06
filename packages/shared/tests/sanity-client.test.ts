import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SanityArticleClient } from '../src/sanity-client';
import { SanityArticle, EnvironmentConfig } from '../src/types';

// Mock @sanity/client
const mockClient = {
  getDocument: vi.fn(),
  createIfNotExists: vi.fn(),
  delete: vi.fn(),
  fetch: vi.fn(),
};

vi.mock('@sanity/client', () => ({
  createClient: vi.fn(() => mockClient),
}));

describe('SanityArticleClient', () => {
  let client: SanityArticleClient;
  let config: EnvironmentConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    config = {
      SANITY_PROJECT_ID: 'test-project',
      SANITY_DATASET: 'test-dataset',
      SANITY_TOKEN: 'test-token',
      SANITY_API_VERSION: '2024-01-01',
    };
    client = new SanityArticleClient(config);
  });

  const mockArticle: SanityArticle = {
    _id: 'article-123',
    _type: 'article',
    title: 'テスト記事',
    slug: { _type: 'slug', current: 'test-article' },
    content: [
      {
        _type: 'block',
        _key: 'block1',
        children: [{ _type: 'span', _key: 'span1', text: 'テストコンテンツ', marks: [] }],
      },
    ],
    lang: 'ja',
    publishedAt: '2025-01-20T10:00:00.000Z',
    type: 'spot',
    prefecture: '東京都',
    tags: ['テスト', 'サンプル'],
  };

  describe('getArticle', () => {
    it('should fetch and validate article', async () => {
      mockClient.getDocument.mockResolvedValue(mockArticle);

      const result = await client.getArticle('article-123');

      expect(result).toEqual(mockArticle);
      expect(mockClient.getDocument).toHaveBeenCalledWith('article-123');
    });

    it('should return null for non-existent document', async () => {
      mockClient.getDocument.mockResolvedValue(null);

      const result = await client.getArticle('non-existent');

      expect(result).toBeNull();
    });

    it('should handle document not found errors', async () => {
      mockClient.getDocument.mockRejectedValue(new Error('Document not found'));

      const result = await client.getArticle('missing-doc');

      expect(result).toBeNull();
    });

    it('should throw error for invalid document structure', async () => {
      const invalidArticle = { _id: 'test', invalid: 'structure' };
      mockClient.getDocument.mockResolvedValue(invalidArticle);

      await expect(client.getArticle('test')).rejects.toThrow('Invalid document structure');
    });

    it('should throw error for other API errors', async () => {
      mockClient.getDocument.mockRejectedValue(new Error('API connection failed'));

      await expect(client.getArticle('test')).rejects.toThrow('Failed to fetch article');
    });
  });

  describe('translationExists', () => {
    it('should return true if translation exists', async () => {
      mockClient.getDocument.mockResolvedValue({ _id: 'article-123-en' });

      const exists = await client.translationExists('article-123', 'en');

      expect(exists).toBe(true);
      expect(mockClient.getDocument).toHaveBeenCalledWith('article-123-en');
    });

    it('should return false if translation does not exist', async () => {
      mockClient.getDocument.mockResolvedValue(null);

      const exists = await client.translationExists('article-123', 'fr');

      expect(exists).toBe(false);
    });

    it('should return false on API errors', async () => {
      mockClient.getDocument.mockRejectedValue(new Error('API error'));

      const exists = await client.translationExists('article-123', 'de');

      expect(exists).toBe(false);
    });
  });

  describe('ID and slug generation', () => {
    it('should generate translated document ID', () => {
      const id = client.generateTranslatedId('article-123', 'en');
      expect(id).toBe('article-123-en');
    });

    it('should generate translated slug', () => {
      const slug = client.generateTranslatedSlug('original-article', 'fr');
      expect(slug).toBe('original-article-fr');
    });

    it('should remove existing language suffix from slug', () => {
      const slug = client.generateTranslatedSlug('article-ja', 'en');
      expect(slug).toBe('article-en');
    });

    it('should handle complex language suffixes', () => {
      const slug = client.generateTranslatedSlug('article-zh-cn', 'ko');
      expect(slug).toBe('article-ko');
    });
  });

  describe('createOrUpdateTranslation', () => {
    const translatedData = {
      title: 'Test Article',
      content: [
        {
          _type: 'block',
          _key: 'block1',
          children: [{ _type: 'span', _key: 'span1', text: 'Test content', marks: [] }],
        },
      ],
      tags: ['test', 'sample'],
    };

    it('should skip creation if translation already exists', async () => {
      mockClient.getDocument.mockResolvedValue({ _id: 'existing-translation' });

      const result = await client.createOrUpdateTranslation(
        mockArticle,
        translatedData.title,
        undefined,
        translatedData.content,
        translatedData.tags,
        'en'
      );

      expect(result).toEqual({
        documentId: 'article-123-en',
        wasCreated: false,
        operation: 'skip',
      });

      expect(mockClient.createIfNotExists).not.toHaveBeenCalled();
    });

    it('should create new translation', async () => {
      mockClient.getDocument.mockResolvedValue(null); // Translation doesn't exist
      mockClient.createIfNotExists.mockResolvedValue({ _id: 'article-123-en' });

      const result = await client.createOrUpdateTranslation(
        mockArticle,
        translatedData.title,
        undefined,
        translatedData.content,
        translatedData.tags,
        'en'
      );

      expect(result).toEqual({
        documentId: 'article-123-en',
        wasCreated: true,
        operation: 'create',
      });

      expect(mockClient.createIfNotExists).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'article-123-en',
          _type: 'article',
          title: 'Test Article',
          slug: { _type: 'slug', current: 'test-article-en' },
          lang: 'en',
          translationOf: { _type: 'reference', _ref: 'article-123' },
        })
      );
    });

    it('should handle dry run mode', async () => {
      mockClient.getDocument.mockResolvedValue(null);

      const result = await client.createOrUpdateTranslation(
        mockArticle,
        translatedData.title,
        undefined,
        translatedData.content,
        translatedData.tags,
        'fr',
        true // dry run
      );

      expect(result).toEqual({
        documentId: 'article-123-fr',
        wasCreated: true,
        operation: 'create',
      });

      expect(mockClient.createIfNotExists).not.toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      mockClient.getDocument.mockResolvedValue(null);
      mockClient.createIfNotExists.mockRejectedValue(new Error('Creation failed'));

      await expect(
        client.createOrUpdateTranslation(
          mockArticle,
          translatedData.title,
          undefined,
          translatedData.content,
          translatedData.tags,
          'de'
        )
      ).rejects.toThrow('Failed to create translation');
    });
  });

  describe('getJapaneseArticles', () => {
    it('should fetch Japanese master articles', async () => {
      const mockArticles = [
        mockArticle, 
        { ...mockArticle, _id: 'article-456', publishedAt: '2025-01-21T10:00:00.000Z', type: 'food', prefecture: '大阪府' }
      ];
      mockClient.fetch.mockResolvedValue(mockArticles);

      const articles = await client.getJapaneseArticles();

      expect(articles).toHaveLength(2);
      expect(mockClient.fetch).toHaveBeenCalledWith(
        expect.stringContaining('lang == "ja" && !defined(translationOf)')
      );
    });

    it('should filter out invalid documents', async () => {
      const mixedArticles = [
        mockArticle,
        { _id: 'invalid', invalid: 'structure' }, // Invalid
        { ...mockArticle, _id: 'article-789', publishedAt: '2025-01-22T10:00:00.000Z', type: 'transport', prefecture: '神奈川県' },
      ];
      mockClient.fetch.mockResolvedValue(mixedArticles);

      const articles = await client.getJapaneseArticles();

      expect(articles).toHaveLength(2);
      expect(articles.every(a => a._type === 'article')).toBe(true);
    });

    it('should handle fetch errors', async () => {
      mockClient.fetch.mockRejectedValue(new Error('Fetch failed'));

      await expect(client.getJapaneseArticles()).rejects.toThrow('Failed to fetch Japanese articles');
    });
  });

  describe('getTranslationStatus', () => {
    it('should return translation status for all languages', async () => {
      mockClient.getDocument
        .mockResolvedValueOnce({ _id: 'article-123-en' }) // en exists
        .mockResolvedValueOnce(null) // fr doesn't exist
        .mockResolvedValueOnce({ _id: 'article-123-de' }); // de exists

      const status = await client.getTranslationStatus('article-123', ['en', 'fr', 'de']);

      expect(status).toEqual([
        { language: 'en', exists: true, documentId: 'article-123-en' },
        { language: 'fr', exists: false, documentId: 'article-123-fr' },
        { language: 'de', exists: true, documentId: 'article-123-de' },
      ]);
    });
  });

  describe('batchCreateTranslations', () => {
    const translations = [
      {
        language: 'en' as const,
        title: 'English Title',
        excerpt: undefined,
        content: [],
        tags: ['english'],
      },
      {
        language: 'fr' as const,
        title: 'French Title',
        excerpt: undefined,
        content: [],
        tags: ['french'],
      },
    ];

    it('should create multiple translations successfully', async () => {
      mockClient.getDocument.mockResolvedValue(null); // No existing translations
      mockClient.createIfNotExists.mockResolvedValue({ success: true });

      const result = await client.batchCreateTranslations(mockArticle, translations);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.results).toHaveLength(2);
    });

    it('should handle mixed success and failures', async () => {
      mockClient.getDocument.mockResolvedValue(null);
      mockClient.createIfNotExists
        .mockResolvedValueOnce({ success: true }) // First succeeds
        .mockRejectedValueOnce(new Error('Creation failed')); // Second fails

      const result = await client.batchCreateTranslations(mockArticle, translations);

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].status).toBe('success');
      expect(result.results[1].status).toBe('failed');
    });

    it('should handle dry run mode', async () => {
      const result = await client.batchCreateTranslations(mockArticle, translations, true);

      expect(result.successful).toBe(2);
      expect(mockClient.createIfNotExists).not.toHaveBeenCalled();
    });
  });

  describe('deleteTranslation', () => {
    it('should delete translation successfully', async () => {
      mockClient.delete.mockResolvedValue({ success: true });

      const result = await client.deleteTranslation('article-123', 'en');

      expect(result).toBe(true);
      expect(mockClient.delete).toHaveBeenCalledWith('article-123-en');
    });

    it('should handle deletion errors gracefully', async () => {
      mockClient.delete.mockRejectedValue(new Error('Delete failed'));

      const result = await client.deleteTranslation('article-123', 'fr');

      expect(result).toBe(false);
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockClient.fetch.mockResolvedValue(42);

      const connected = await client.testConnection();

      expect(connected).toBe(true);
      expect(mockClient.fetch).toHaveBeenCalledWith('count(*)');
    });

    it('should return false for connection failures', async () => {
      mockClient.fetch.mockRejectedValue(new Error('Connection failed'));

      const connected = await client.testConnection();

      expect(connected).toBe(false);
    });
  });
});