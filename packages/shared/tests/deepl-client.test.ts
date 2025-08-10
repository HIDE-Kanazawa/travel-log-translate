import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import { DeepLClient } from '../src/deepl-client';

// Mock deepl-node
const mockTranslator = {
  translateText: vi.fn(),
  getUsage: vi.fn(),
};

vi.mock('deepl-node', () => ({
  Translator: vi.fn(() => mockTranslator),
}));

// Mock fs for cache operations
vi.mock('fs/promises');

describe('DeepLClient', () => {
  let client: DeepLClient;
  const TEST_CACHE_DIR = './test-deepl-cache';

  beforeEach(() => {
    vi.clearAllMocks();
    client = new DeepLClient('test-api-key', TEST_CACHE_DIR);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize cache from disk', async () => {
      const mockCacheData = [
        {
          hash: 'test-hash',
          sourceText: 'Hello',
          targetLanguage: 'en',
          translatedText: 'こんにちは',
          timestamp: Date.now(),
        },
      ];

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockCacheData));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await client.init();

      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('test-deepl-cache'), { recursive: true });
      expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('translations.json'), 'utf-8');
    });

    it('should handle missing cache file gracefully', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      await expect(client.init()).resolves.not.toThrow();
    });
  });

  describe('translation with caching', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No cache'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      await client.init();
    });

    it('should translate text and cache result', async () => {
      mockTranslator.translateText.mockResolvedValue({ text: 'Hello World' });

      const result = await client.translateText('こんにちは世界', 'en');

      expect(result).toEqual({
        translation: 'Hello World',
        usedCache: false,
        characterCount: 5, // Length of 'こんにちは世界'
      });

      expect(mockTranslator.translateText).toHaveBeenCalledWith('こんにちは世界', 'ja', 'EN-US');
    });

    it('should use cached translation when available', async () => {
      // First translation
      mockTranslator.translateText.mockResolvedValue({ text: 'Hello World' });
      await client.translateText('こんにちは世界', 'en');

      // Second translation should use cache
      const result = await client.translateText('こんにちは世界', 'en');

      expect(result).toEqual({
        translation: 'Hello World',
        usedCache: true,
        characterCount: 0,
      });

      // Should only call API once
      expect(mockTranslator.translateText).toHaveBeenCalledTimes(1);
    });

    it('should handle empty text', async () => {
      const result = await client.translateText('', 'en');

      expect(result).toEqual({
        translation: '',
        usedCache: false,
        characterCount: 0,
      });

      expect(mockTranslator.translateText).not.toHaveBeenCalled();
    });

    it('should split long text into chunks', async () => {
      const longText = 'a'.repeat(3000); // Exceeds 2000 char limit
      mockTranslator.translateText
        .mockResolvedValueOnce({ text: 'chunk1' })
        .mockResolvedValueOnce({ text: 'chunk2' });

      const result = await client.translateText(longText, 'en');

      expect(result.translation).toBe('chunk1 chunk2');
      expect(mockTranslator.translateText).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors with retry', async () => {
      mockTranslator.translateText
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({ text: 'Success' });

      const result = await client.translateText('test', 'en');

      expect(result.translation).toBe('Success');
      expect(mockTranslator.translateText).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retries', async () => {
      mockTranslator.translateText.mockRejectedValue(new Error('Persistent API Error'));

      await expect(client.translateText('test', 'en')).rejects.toThrow('Persistent API Error');
      expect(mockTranslator.translateText).toHaveBeenCalledTimes(6); // Initial + 5 retries
    });
  });

  describe('batch translation', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No cache'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      await client.init();
    });

    it('should translate multiple texts', async () => {
      mockTranslator.translateText
        .mockResolvedValueOnce({ text: 'Hello' })
        .mockResolvedValueOnce({ text: 'World' });

      const result = await client.translateBatch(['こんにちは', '世界'], 'en');

      expect(result).toEqual({
        translations: ['Hello', 'World'],
        usedCache: [false, false],
        totalCharacterCount: 7, // 3 + 2 + 2
      });
    });

    it('should handle mixed cache hits and misses', async () => {
      // Pre-populate cache for first text
      mockTranslator.translateText.mockResolvedValue({ text: 'Hello' });
      await client.translateText('こんにちは', 'en');

      // Now test batch with one cached, one new
      mockTranslator.translateText.mockResolvedValue({ text: 'World' });
      const result = await client.translateBatch(['こんにちは', '世界'], 'en');

      expect(result).toEqual({
        translations: ['Hello', 'World'],
        usedCache: [true, false],
        totalCharacterCount: 2, // Only '世界' counted as new
      });
    });
  });

  describe('usage tracking', () => {
    it('should get usage information', async () => {
      const mockUsage = {
        character: { count: 1000, limit: 500000 },
      };
      mockTranslator.getUsage.mockResolvedValue(mockUsage);

      const usage = await client.getUsage();

      expect(usage).toEqual({
        characterCount: 1000,
        characterLimit: 500000,
        remaining: 499000,
        percentage: 0.2,
      });
    });

    it('should handle missing usage data gracefully', async () => {
      const mockUsage = {};
      mockTranslator.getUsage.mockResolvedValue(mockUsage);

      const usage = await client.getUsage();

      expect(usage).toEqual({
        characterCount: 0,
        characterLimit: 500000,
        remaining: 500000,
        percentage: 0,
      });
    });

    it('should check character limit', async () => {
      const mockUsage = {
        character: { count: 400000, limit: 500000 },
      };
      mockTranslator.getUsage.mockResolvedValue(mockUsage);

      const canTranslate = await client.checkCharacterLimit(50000); // Would use 90%

      expect(canTranslate).toBe(true);
    });

    it('should reject translation exceeding limit', async () => {
      const mockUsage = {
        character: { count: 480000, limit: 500000 },
      };
      mockTranslator.getUsage.mockResolvedValue(mockUsage);

      const canTranslate = await client.checkCharacterLimit(50000); // Would exceed 90%

      expect(canTranslate).toBe(false);
    });

    it('should handle usage check errors gracefully', async () => {
      mockTranslator.getUsage.mockRejectedValue(new Error('Usage API error'));

      const canTranslate = await client.checkCharacterLimit(10000);

      expect(canTranslate).toBe(true); // Should default to allowing translation
    });
  });

  describe('cache management', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No cache'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      await client.init();
    });

    it('should save cache to disk', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      mockTranslator.translateText.mockResolvedValue({ text: 'Hello' });

      await client.translateText('こんにちは', 'en');
      await client.saveCache();

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('translations.json'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should clear expired cache entries', async () => {
      mockTranslator.translateText.mockResolvedValue({ text: 'Hello' });

      // Add translation to cache
      await client.translateText('こんにちは', 'en');

      // Manually expire the cache entry by manipulating timestamp
      const cacheMap = (client as any).cache;
      const entries = Array.from(cacheMap.values());
      if (entries.length > 0) {
        entries[0].timestamp = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
      }

      const statsBefore = client.getCacheStats();
      expect(statsBefore.totalEntries).toBe(1);

      client.clearExpiredCache();

      const statsAfter = client.getCacheStats();
      expect(statsAfter.totalEntries).toBe(0);
    });

    it('should provide cache statistics', async () => {
      mockTranslator.translateText
        .mockResolvedValueOnce({ text: 'Hello' })
        .mockResolvedValueOnce({ text: 'Bonjour' });

      await client.translateText('こんにちは', 'en');
      await client.translateText('こんにちは', 'fr');

      const stats = client.getCacheStats();

      expect(stats.totalEntries).toBe(2);
      expect(stats.totalLanguages).toBe(2);
      expect(stats.oldestEntry).toBeTypeOf('number');
    });
  });

  describe('language support', () => {
    beforeEach(async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('No cache'));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      await client.init();
    });

    it('should handle Chinese language variants', async () => {
      mockTranslator.translateText.mockResolvedValue({ text: '你好' });

      await client.translateText('こんにちは', 'zh-cn');
      expect(mockTranslator.translateText).toHaveBeenCalledWith('こんにちは', 'ja', 'ZH');

      await client.translateText('こんにちは', 'zh-tw');
      expect(mockTranslator.translateText).toHaveBeenCalledWith('こんにちは', 'ja', 'ZH');
    });

    it('should throw error for unsupported language', async () => {
      await expect(client.translateText('test', 'unsupported' as any)).rejects.toThrow(
        'Unsupported target language: unsupported'
      );
    });
  });
});