import * as deepl from 'deepl-node';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { TargetLanguage, DEEPL_LANGUAGE_MAP, TranslationCacheEntry, DeepLUsage } from './types.js';

/**
 * DeepL client wrapper with caching and rate limiting
 */
export class DeepLClient {
  private translator: deepl.Translator;
  private cache: Map<string, TranslationCacheEntry> = new Map();
  private cachePath: string;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 100; // 10 req/sec

  constructor(apiKey: string, cacheDir = '.deepl-cache') {
    this.translator = new deepl.Translator(apiKey);
    this.cachePath = path.resolve(cacheDir, 'translations.json');
  }

  /**
   * Initialize cache by loading from disk
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
      const data = await fs.readFile(this.cachePath, 'utf-8');
      const entries = JSON.parse(data) as TranslationCacheEntry[];

      for (const entry of entries) {
        this.cache.set(this.getCacheKey(entry.sourceText, entry.targetLanguage), entry);
      }
    } catch {
      // Cache file doesn't exist or is invalid, start with empty cache
      this.cache.clear();
    }
  }

  /**
   * Save cache to disk
   */
  async saveCache(): Promise<void> {
    try {
      const entries = Array.from(this.cache.values());
      await fs.writeFile(this.cachePath, JSON.stringify(entries, null, 2), 'utf-8');
    } catch (error) {
      console.warn('Failed to save cache:', error);
    }
  }

  /**
   * Generate cache key for text and language
   */
  private getCacheKey(text: string, language: TargetLanguage): string {
    return crypto.createHash('sha256').update(`${text}:${language}`).digest('hex');
  }

  /**
   * Check if translation exists in cache
   */
  private getCachedTranslation(text: string, language: TargetLanguage): string | null {
    const key = this.getCacheKey(text, language);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if cache entry is older than 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (entry.timestamp < thirtyDaysAgo) {
      this.cache.delete(key);
      return null;
    }

    return entry.translatedText;
  }

  /**
   * Cache translation result
   */
  private setCachedTranslation(text: string, language: TargetLanguage, translation: string): void {
    const key = this.getCacheKey(text, language);
    this.cache.set(key, {
      hash: key,
      sourceText: text,
      targetLanguage: language,
      translatedText: translation,
      timestamp: Date.now(),
    });
  }

  /**
   * Rate limiting - ensure minimum interval between requests
   */
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.MIN_REQUEST_INTERVAL) {
      await new Promise(resolve => setTimeout(resolve, this.MIN_REQUEST_INTERVAL - elapsed));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Retry with exponential backoff
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    initialDelay = 5000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) break;

        const delay = initialDelay * Math.pow(2, attempt);
        console.warn(
          `DeepL request failed (attempt ${attempt + 1}), retrying in ${delay}ms:`,
          error
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Split text into chunks for DeepL API (max 2000 chars per request)
   */
  private splitText(text: string, maxLength = 2000): string[] {
    if (text.length <= maxLength) return [text];

    const chunks: string[] = [];
    let currentChunk = '';

    // Split by sentences first
    const sentences = text.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLength) {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = sentence;
        } else {
          // Sentence is too long, split by words
          const words = sentence.split(' ');
          let wordChunk = '';

          for (const word of words) {
            if (wordChunk.length + word.length + 1 <= maxLength) {
              wordChunk += (wordChunk ? ' ' : '') + word;
            } else {
              if (wordChunk) chunks.push(wordChunk);
              wordChunk = word;
            }
          }

          if (wordChunk) currentChunk = wordChunk;
        }
      }
    }

    if (currentChunk) chunks.push(currentChunk);

    return chunks;
  }

  /**
   * Translate text to target language
   */
  async translateText(
    text: string,
    targetLanguage: TargetLanguage
  ): Promise<{
    translation: string;
    usedCache: boolean;
    characterCount: number;
  }> {
    if (!text.trim()) {
      return { translation: '', usedCache: false, characterCount: 0 };
    }

    // Check cache first
    const cached = this.getCachedTranslation(text, targetLanguage);
    if (cached) {
      return { translation: cached, usedCache: true, characterCount: 0 };
    }

    const deeplTargetLang = DEEPL_LANGUAGE_MAP[targetLanguage];
    if (!deeplTargetLang) {
      throw new Error(`Unsupported target language: ${targetLanguage}`);
    }

    // Split text into chunks if necessary
    const chunks = this.splitText(text);
    const translations: string[] = [];
    let totalCharacters = 0;

    for (const chunk of chunks) {
      await this.rateLimit();

      const translation = await this.retryWithBackoff(async () => {
        const result = await this.translator.translateText(
          chunk,
          'ja',
          deeplTargetLang as deepl.TargetLanguageCode
        );

        return Array.isArray(result) ? result[0].text : (result as any).text;
      });

      translations.push(translation);
      totalCharacters += chunk.length;
    }

    const finalTranslation = translations.join(' ');

    // Cache the result
    this.setCachedTranslation(text, targetLanguage, finalTranslation);

    return {
      translation: finalTranslation,
      usedCache: false,
      characterCount: totalCharacters,
    };
  }

  /**
   * Translate multiple texts in batch
   */
  async translateBatch(
    texts: string[],
    targetLanguage: TargetLanguage
  ): Promise<{
    translations: string[];
    usedCache: boolean[];
    totalCharacterCount: number;
  }> {
    const results = await Promise.all(texts.map(text => this.translateText(text, targetLanguage)));

    return {
      translations: results.map(r => r.translation),
      usedCache: results.map(r => r.usedCache),
      totalCharacterCount: results.reduce((sum, r) => sum + r.characterCount, 0),
    };
  }

  /**
   * Get DeepL usage information
   */
  async getUsage(): Promise<DeepLUsage> {
    try {
      const usage = await this.translator.getUsage();
      const characterCount = usage.character?.count || 0;
      const characterLimit = usage.character?.limit || 500000;
      const remaining = characterLimit - characterCount;
      const percentage = (characterCount / characterLimit) * 100;

      return {
        characterCount,
        characterLimit,
        remaining,
        percentage,
      };
    } catch (error) {
      throw new Error(
        `Failed to get DeepL usage: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if translation would exceed character limit
   */
  async checkCharacterLimit(estimatedCharacters: number, maxPercentage = 90): Promise<boolean> {
    try {
      const usage = await this.getUsage();
      const wouldExceed =
        usage.characterCount + estimatedCharacters > (usage.characterLimit * maxPercentage) / 100;
      return !wouldExceed;
    } catch {
      // If we can't check usage, assume it's OK
      return true;
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < thirtyDaysAgo) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    totalLanguages: number;
    oldestEntry: number | null;
  } {
    const languages = new Set<string>();
    let oldestEntry: number | null = null;

    for (const entry of this.cache.values()) {
      languages.add(entry.targetLanguage);
      if (oldestEntry === null || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
    }

    return {
      totalEntries: this.cache.size,
      totalLanguages: languages.size,
      oldestEntry,
    };
  }
}
