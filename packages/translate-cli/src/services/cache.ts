import fs from 'fs/promises';
import path from 'path';
import { CacheEntry } from '../types/index.js';

/**
 * JSON-based cache for translation results
 */
export class Cache {
  private cachePath: string;
  private cache: Map<string, CacheEntry> = new Map();

  constructor(cacheDir = '.cache') {
    this.cachePath = path.resolve(cacheDir, 'translations.json');
  }

  /**
   * Initialize cache by loading from disk
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
      const data = await fs.readFile(this.cachePath, 'utf-8');
      const entries = JSON.parse(data) as Record<string, CacheEntry>;

      for (const [key, entry] of Object.entries(entries)) {
        this.cache.set(key, entry);
      }
    } catch (error) {
      // Cache file doesn't exist or is invalid, start with empty cache
      this.cache.clear();
    }
  }

  /**
   * Get cached translation for a specific content hash and language
   */
  get(contentHash: string, language: string): CacheEntry['translations'][string] | null {
    const entry = this.cache.get(contentHash);
    if (!entry) return null;

    const translation = entry.translations[language];
    if (!translation) return null;

    // Check if cache entry is older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (entry.timestamp < thirtyDaysAgo) {
      return null;
    }

    return translation;
  }

  /**
   * Set cached translation for a specific content hash and language
   */
  set(
    contentHash: string,
    language: string,
    translation: CacheEntry['translations'][string]
  ): void {
    let entry = this.cache.get(contentHash);

    if (!entry) {
      entry = {
        hash: contentHash,
        translations: {},
        timestamp: Date.now(),
      };
      this.cache.set(contentHash, entry);
    }

    entry.translations[language] = translation;
    entry.timestamp = Date.now();
  }

  /**
   * Check if translation exists in cache
   */
  has(contentHash: string, language: string): boolean {
    return this.get(contentHash, language) !== null;
  }

  /**
   * Save cache to disk
   */
  async save(): Promise<void> {
    try {
      const entries: Record<string, CacheEntry> = {};
      for (const [key, entry] of this.cache.entries()) {
        entries[key] = entry;
      }

      await fs.writeFile(this.cachePath, JSON.stringify(entries, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to save cache: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { totalEntries: number; totalTranslations: number; oldestEntry: number | null } {
    let totalTranslations = 0;
    let oldestEntry: number | null = null;

    for (const entry of this.cache.values()) {
      totalTranslations += Object.keys(entry.translations).length;
      if (oldestEntry === null || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
    }

    return {
      totalEntries: this.cache.size,
      totalTranslations,
      oldestEntry,
    };
  }

  /**
   * Remove expired cache entries
   */
  cleanup(): void {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < thirtyDaysAgo) {
        this.cache.delete(key);
      }
    }
  }
}
