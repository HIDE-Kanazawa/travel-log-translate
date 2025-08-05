import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { FileProcessor } from '../src/services/file-processor';
import { TranslationService } from '../src/services/translation';
import { Cache } from '../src/services/cache';
import { Logger } from '../src/utils/logger';

// Mock external dependencies
vi.mock('../src/services/translation');
vi.mock('../src/services/cache');
vi.mock('../src/utils/logger');

const TEST_FIXTURES_DIR = './tests/fixtures';
const TEST_OUTPUT_DIR = './test-output';

describe('FileProcessor', () => {
  let fileProcessor: FileProcessor;
  let mockTranslationService: any;
  let mockCache: any;
  let mockLogger: any;

  beforeEach(() => {
    mockTranslationService = {
      translateBatch: vi.fn(),
      checkCharacterLimit: vi.fn().mockResolvedValue(true),
    };

    mockCache = {
      init: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      set: vi.fn(),
      save: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    fileProcessor = new FileProcessor(mockTranslationService, mockCache, mockLogger);
  });

  afterEach(async () => {
    // Clean up test output directory
    try {
      await fs.rm(TEST_OUTPUT_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  it('should process Japanese markdown file successfully', async () => {
    const testFilePath = path.join(TEST_FIXTURES_DIR, 'sample-ja.md');
    
    // Mock translation responses
    mockTranslationService.translateBatch.mockResolvedValue([
      'Top 5 Hidden Gems in Tokyo',
      'Tokyo is one of the world\'s leading tourist cities, but there are many hidden gems not found in tourist guides. This time, we will introduce 5 special places that only locals know.',
      'Discover the hidden charming places in Tokyo that are not listed in tourist guides, known only to locals.',
      'tokyo',
      'tourism',
      'hidden-spots',
    ]);

    const result = await fileProcessor.processFile(testFilePath, ['en'], {
      dryRun: true, // Don't actually write files in test
    });

    expect(result.translated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    // Verify translation service was called
    expect(mockTranslationService.translateBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining('東京の隠れた名所5選'),
        expect.stringContaining('東京は世界でも有数の観光都市'),
        expect.stringContaining('観光ガイドには載っていない'),
        '東京',
        '観光',
        '隠れスポット'
      ]),
      'en'
    );

    // Verify cache was used
    expect(mockCache.init).toHaveBeenCalled();
    expect(mockCache.get).toHaveBeenCalled();
    expect(mockCache.set).toHaveBeenCalled();
    // save() is only called when not in dry run mode
    expect(mockCache.save).not.toHaveBeenCalled();
  });

  it('should skip non-Japanese files', async () => {
    // Create a temporary English file
    const englishFile = path.join(TEST_OUTPUT_DIR, 'english-sample.md');
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
    await fs.writeFile(englishFile, `---
title: English Article
lang: en
slug: english-article
---

This is an English article.`);

    const result = await fileProcessor.processFile(englishFile, ['fr'], {
      dryRun: true,
    });

    expect(result.translated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Skipping non-Japanese file',
      expect.objectContaining({ lang: 'en' })
    );
  });

  it('should handle content length limit', async () => {
    // Create a file with content exceeding 15,000 characters
    const longContentFile = path.join(TEST_OUTPUT_DIR, 'long-content.md');
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });
    
    const longContent = 'あ'.repeat(15001); // Exceeds 15,000 character limit
    await fs.writeFile(longContentFile, `---
title: Long Content Article
lang: ja
slug: long-content
---

${longContent}`);

    const result = await fileProcessor.processFile(longContentFile, ['en'], {
      dryRun: true,
    });

    expect(result.translated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(1);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Content exceeds 15,000 character limit',
      expect.objectContaining({ limit: 15000 })
    );
  });

  it('should handle DeepL quota limit', async () => {
    const testFilePath = path.join(TEST_FIXTURES_DIR, 'sample-ja.md');
    
    // Mock quota limit exceeded
    mockTranslationService.checkCharacterLimit.mockResolvedValue(false);

    const result = await fileProcessor.processFile(testFilePath, ['en'], {
      dryRun: true,
    });

    expect(result.translated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(1);

    expect(mockLogger.error).toHaveBeenCalledWith(
      'DeepL character limit would be exceeded',
      expect.any(Object)
    );
  });

  it('should use cached translations', async () => {
    const testFilePath = path.join(TEST_FIXTURES_DIR, 'sample-ja.md');
    
    // Mock cached translation
    mockCache.get.mockReturnValue({
      title: 'Cached Title',
      excerpt: 'Cached excerpt',
      tags: ['cached', 'tag'],
      content: 'Cached content',
    });

    const result = await fileProcessor.processFile(testFilePath, ['en'], {
      dryRun: true,
    });

    expect(result.translated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);

    // Should not call translation service when using cache
    expect(mockTranslationService.translateBatch).not.toHaveBeenCalled();

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Used cached translation',
      expect.any(Object)
    );
  });

  it('should handle force re-translation', async () => {
    const testFilePath = path.join(TEST_FIXTURES_DIR, 'sample-ja.md');
    
    // Mock cached translation exists
    mockCache.get.mockReturnValue({
      title: 'Cached Title',
      content: 'Cached content',
    });

    // Mock fresh translation
    mockTranslationService.translateBatch.mockResolvedValue([
      'Fresh Translation Title',
      'Fresh translation content',
      'Fresh excerpt',
      'fresh',
      'translation',
      'tags',
    ]);

    const result = await fileProcessor.processFile(testFilePath, ['en'], {
      dryRun: true,
      force: true, // Force re-translation
    });

    expect(result.translated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    // Should call translation service even with cache when forcing
    expect(mockTranslationService.translateBatch).toHaveBeenCalled();
  });

  it('should handle translation errors gracefully', async () => {
    const testFilePath = path.join(TEST_FIXTURES_DIR, 'sample-ja.md');
    
    // Mock translation service error
    mockTranslationService.translateBatch.mockRejectedValue(new Error('Translation API error'));

    const result = await fileProcessor.processFile(testFilePath, ['en', 'fr'], {
      dryRun: true,
    });

    expect(result.translated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(2); // Error for both languages

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Translation failed',
      expect.objectContaining({
        error: 'Translation API error'
      })
    );
  });

  it('should process multiple target languages', async () => {
    const testFilePath = path.join(TEST_FIXTURES_DIR, 'sample-ja.md');
    
    mockTranslationService.translateBatch.mockResolvedValue([
      'Translated Title',
      'Translated content',
      'Translated excerpt',
      'translated',
      'tags',
      'here',
    ]);

    const result = await fileProcessor.processFile(testFilePath, ['en', 'fr', 'de'], {
      dryRun: true,
    });

    expect(result.translated).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);

    // Should be called once for each language
    expect(mockTranslationService.translateBatch).toHaveBeenCalledTimes(3);
  });
});