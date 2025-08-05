import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { Cache } from '../src/services/cache';

const TEST_CACHE_DIR = './test-cache';

describe('Cache', () => {
  let cache: Cache;

  beforeEach(async () => {
    cache = new Cache(TEST_CACHE_DIR);
    await cache.init();
  });

  afterEach(async () => {
    // Clean up test cache directory
    try {
      await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true });
    } catch {
      // Ignore errors if directory doesn't exist
    }
  });

  it('should initialize empty cache', async () => {
    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.totalTranslations).toBe(0);
    expect(stats.oldestEntry).toBeNull();
  });

  it('should store and retrieve cached translation', () => {
    const contentHash = 'test-hash-123';
    const language = 'en';
    const translation = {
      title: 'Test Title',
      excerpt: 'Test excerpt',
      tags: ['test', 'translation'],
      content: 'Test content',
    };

    // Set translation
    cache.set(contentHash, language, translation);

    // Retrieve translation
    const retrieved = cache.get(contentHash, language);
    expect(retrieved).toEqual(translation);
  });

  it('should return null for non-existent translation', () => {
    const result = cache.get('non-existent-hash', 'en');
    expect(result).toBeNull();
  });

  it('should check if translation exists', () => {
    const contentHash = 'test-hash-456';
    const language = 'fr';
    const translation = {
      title: 'Titre de test',
      content: 'Contenu de test',
    };

    expect(cache.has(contentHash, language)).toBe(false);
    
    cache.set(contentHash, language, translation);
    
    expect(cache.has(contentHash, language)).toBe(true);
  });

  it('should save and load cache from disk', async () => {
    const contentHash = 'persistent-hash';
    const language = 'de';
    const translation = {
      title: 'Test Titel',
      content: 'Test Inhalt',
    };

    // Set translation and save
    cache.set(contentHash, language, translation);
    await cache.save();

    // Create new cache instance and load from disk
    const newCache = new Cache(TEST_CACHE_DIR);
    await newCache.init();

    // Should retrieve the saved translation
    const retrieved = newCache.get(contentHash, language);
    expect(retrieved).toEqual(translation);
  });

  it('should handle multiple languages for same content', () => {
    const contentHash = 'multi-lang-hash';
    const translations = {
      en: { title: 'English Title', content: 'English content' },
      fr: { title: 'Titre français', content: 'Contenu français' },
      de: { title: 'Deutscher Titel', content: 'Deutscher Inhalt' },
    };

    // Set translations for multiple languages
    Object.entries(translations).forEach(([lang, translation]) => {
      cache.set(contentHash, lang, translation);
    });

    // Retrieve all translations
    Object.entries(translations).forEach(([lang, expectedTranslation]) => {
      const retrieved = cache.get(contentHash, lang);
      expect(retrieved).toEqual(expectedTranslation);
    });

    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.totalTranslations).toBe(3);
  });

  it('should clear all cache entries', () => {
    cache.set('hash1', 'en', { title: 'Title 1', content: 'Content 1' });
    cache.set('hash2', 'fr', { title: 'Titre 2', content: 'Contenu 2' });

    expect(cache.getStats().totalEntries).toBe(2);

    cache.clear();

    expect(cache.getStats().totalEntries).toBe(0);
    expect(cache.get('hash1', 'en')).toBeNull();
    expect(cache.get('hash2', 'fr')).toBeNull();
  });

  it('should return null for expired cache entries', () => {
    const contentHash = 'expired-hash';
    const language = 'en';
    const translation = {
      title: 'Expired Title',
      content: 'Expired content',
    };

    // Manually create an expired cache entry
    const expiredTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago
    cache.set(contentHash, language, translation);
    
    // Manually modify timestamp to simulate expired entry
    const cacheMap = (cache as any).cache;
    const entry = cacheMap.get(contentHash);
    entry.timestamp = expiredTimestamp;

    // Should return null for expired entry
    const retrieved = cache.get(contentHash, language);
    expect(retrieved).toBeNull();
  });

  it('should cleanup expired entries', () => {
    const recentHash = 'recent-hash';
    const expiredHash = 'expired-hash';
    const language = 'en';

    // Add recent translation
    cache.set(recentHash, language, { title: 'Recent', content: 'Recent content' });
    
    // Add expired translation
    cache.set(expiredHash, language, { title: 'Expired', content: 'Expired content' });
    
    // Manually modify timestamp to simulate expired entry
    const cacheMap = (cache as any).cache;
    const expiredEntry = cacheMap.get(expiredHash);
    expiredEntry.timestamp = Date.now() - (31 * 24 * 60 * 60 * 1000); // 31 days ago

    expect(cache.getStats().totalEntries).toBe(2);

    cache.cleanup();

    expect(cache.getStats().totalEntries).toBe(1);
    expect(cache.has(recentHash, language)).toBe(true);
    expect(cache.has(expiredHash, language)).toBe(false);
  });
});