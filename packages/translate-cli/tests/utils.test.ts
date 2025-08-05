import { describe, it, expect } from 'vitest';
import { generateContentHash, generateSlugWithLang, translateTags } from '../src/utils/hash';

describe('Hash Utils', () => {
  describe('generateContentHash', () => {
    it('should generate consistent hash for same content', () => {
      const content = 'This is test content';
      const frontMatter = {
        title: 'Test Title',
        excerpt: 'Test excerpt',
        tags: ['test', 'content'],
      };

      const hash1 = generateContentHash(content, frontMatter);
      const hash2 = generateContentHash(content, frontMatter);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex string length
    });

    it('should generate different hash for different content', () => {
      const frontMatter = {
        title: 'Test Title',
        excerpt: 'Test excerpt',
        tags: ['test', 'content'],
      };

      const hash1 = generateContentHash('Content 1', frontMatter);
      const hash2 = generateContentHash('Content 2', frontMatter);

      expect(hash1).not.toBe(hash2);
    });

    it('should generate different hash for different front matter', () => {
      const content = 'Same content';

      const hash1 = generateContentHash(content, { title: 'Title 1' });
      const hash2 = generateContentHash(content, { title: 'Title 2' });

      expect(hash1).not.toBe(hash2);
    });

    it('should handle content with whitespace consistently', () => {
      const frontMatter = { title: 'Test' };

      const hash1 = generateContentHash('  Content with spaces  ', frontMatter);
      const hash2 = generateContentHash('Content with spaces', frontMatter);

      expect(hash1).toBe(hash2);
    });
  });

  describe('generateSlugWithLang', () => {
    it('should add language suffix to slug', () => {
      const result = generateSlugWithLang('tokyo-travel-guide', 'en');
      expect(result).toBe('tokyo-travel-guide-en');
    });

    it('should replace existing language suffix', () => {
      const result = generateSlugWithLang('tokyo-travel-guide-ja', 'en');
      expect(result).toBe('tokyo-travel-guide-en');
    });

    it('should handle two-part language codes', () => {
      const result = generateSlugWithLang('travel-guide-zh-cn', 'fr');
      expect(result).toBe('travel-guide-fr');
    });

    it('should handle slug without existing language suffix', () => {
      const result = generateSlugWithLang('simple-slug', 'de');
      expect(result).toBe('simple-slug-de');
    });
  });

  describe('translateTags', () => {
    it('should convert tags to kebab-case', () => {
      const originalTags = ['旅行', '東京', '観光地'];
      const translations = ['Travel Guide', 'Tokyo Adventure', 'Tourist Spots'];

      const result = translateTags(originalTags, translations);

      expect(result).toEqual(['travel-guide', 'tokyo-adventure', 'tourist-spots']);
    });

    it('should handle special characters', () => {
      const originalTags = ['テスト'];
      const translations = ['Test & Development!'];

      const result = translateTags(originalTags, translations);

      expect(result).toEqual(['test-development']);
    });

    it('should handle multiple spaces and hyphens', () => {
      const originalTags = ['タグ'];
      const translations = ['Multiple   Spaces  -  And -- Hyphens'];

      const result = translateTags(originalTags, translations);

      expect(result).toEqual(['multiple-spaces-and-hyphens']);
    });

    it('should handle empty translations', () => {
      const originalTags = ['タグ'];
      const translations = [''];

      const result = translateTags(originalTags, translations);

      expect(result).toEqual(['']);
    });

    it('should handle translations with only special characters', () => {
      const originalTags = ['タグ'];
      const translations = ['!@#$%'];

      const result = translateTags(originalTags, translations);

      expect(result).toEqual(['']);
    });

    it('should preserve numbers in tags', () => {
      const originalTags = ['タグ'];
      const translations = ['Travel 2024 Guide'];

      const result = translateTags(originalTags, translations);

      expect(result).toEqual(['travel-2024-guide']);
    });
  });
});