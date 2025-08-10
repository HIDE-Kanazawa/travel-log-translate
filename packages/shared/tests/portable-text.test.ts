import { describe, it, expect } from 'vitest';
import {
  extractTextsFromPortableText,
  injectTextsIntoPortableText,
  countCharactersInPortableText,
  isTextBlock,
  isImageBlock,
  isCodeBlock,
  extractImageReferences,
  validatePortableTextStructure,
  sanitizePortableTextBlocks,
  summarizePortableTextContent,
  convertToSlug,
} from '../src/portable-text';

describe('Portable Text Utils', () => {
  const sampleBlocks = [
    {
      _type: 'block',
      _key: 'block1',
      style: 'normal',
      children: [
        { _type: 'span', _key: 'span1', text: 'Hello world!', marks: [] },
        { _type: 'span', _key: 'span2', text: ' This is a test.', marks: [] },
      ],
    },
    {
      _type: 'image',
      _key: 'image1',
      asset: { _type: 'reference', _ref: 'image-abc123' },
      alt: 'Sample image',
    },
    {
      _type: 'block',
      _key: 'block2',
      style: 'h2',
      children: [
        { _type: 'span', _key: 'span3', text: 'Sample Header', marks: [] },
      ],
    },
    {
      _type: 'code',
      _key: 'code1',
      code: 'console.log("Hello");',
      language: 'javascript',
    },
  ];

  describe('extractTextsFromPortableText', () => {
    it('should extract text from span elements', () => {
      const texts = extractTextsFromPortableText(sampleBlocks);
      
      expect(texts).toHaveLength(3);
      expect(texts[0]).toEqual({
        path: 'blocks[0].children[0].text',
        text: 'Hello world!',
        blockIndex: 0,
        spanIndex: 0,
      });
      expect(texts[1]).toEqual({
        path: 'blocks[0].children[1].text',
        text: ' This is a test.',
        blockIndex: 0,
        spanIndex: 1,
      });
      expect(texts[2]).toEqual({
        path: 'blocks[2].children[0].text',
        text: 'Sample Header',
        blockIndex: 2,
        spanIndex: 0,
      });
    });

    it('should skip non-text blocks', () => {
      const imageOnlyBlocks = [sampleBlocks[1]]; // Image block
      const texts = extractTextsFromPortableText(imageOnlyBlocks);
      
      expect(texts).toHaveLength(0);
    });

    it('should skip empty text spans', () => {
      const blocksWithEmptyText = [
        {
          _type: 'block',
          _key: 'block1',
          children: [
            { _type: 'span', _key: 'span1', text: '', marks: [] },
            { _type: 'span', _key: 'span2', text: '   ', marks: [] },
            { _type: 'span', _key: 'span3', text: 'Valid text', marks: [] },
          ],
        },
      ];
      
      const texts = extractTextsFromPortableText(blocksWithEmptyText);
      expect(texts).toHaveLength(1);
      expect(texts[0].text).toBe('Valid text');
    });
  });

  describe('injectTextsIntoPortableText', () => {
    it('should inject translated texts back into blocks', () => {
      const extractedTexts = [
        { path: 'blocks[0].children[0].text', text: 'Hello world!', blockIndex: 0, spanIndex: 0 },
        { path: 'blocks[0].children[1].text', text: ' This is a test.', blockIndex: 0, spanIndex: 1 },
        { path: 'blocks[2].children[0].text', text: 'Sample Header', blockIndex: 2, spanIndex: 0 },
      ];
      
      const translations = ['こんにちは世界！', ' これはテストです。', 'サンプルヘッダー'];
      
      const updatedBlocks = injectTextsIntoPortableText(sampleBlocks, extractedTexts, translations);
      
      expect(updatedBlocks[0].children[0].text).toBe('こんにちは世界！');
      expect(updatedBlocks[0].children[1].text).toBe(' これはテストです。');
      expect(updatedBlocks[2].children[0].text).toBe('サンプルヘッダー');
    });

    it('should preserve non-text blocks unchanged', () => {
      const extractedTexts = [
        { path: 'blocks[0].children[0].text', text: 'Hello world!', blockIndex: 0, spanIndex: 0 },
      ];
      const translations = ['こんにちは世界！'];
      
      const updatedBlocks = injectTextsIntoPortableText(sampleBlocks, extractedTexts, translations);
      
      // Image block should remain unchanged
      expect(updatedBlocks[1]).toEqual(sampleBlocks[1]);
      // Code block should remain unchanged
      expect(updatedBlocks[3]).toEqual(sampleBlocks[3]);
    });

    it('should handle missing translations gracefully', () => {
      const extractedTexts = [
        { path: 'blocks[0].children[0].text', text: 'Hello world!', blockIndex: 0, spanIndex: 0 },
        { path: 'blocks[0].children[1].text', text: ' This is a test.', blockIndex: 0, spanIndex: 1 },
      ];
      const translations = ['こんにちは世界！']; // Missing second translation
      
      const updatedBlocks = injectTextsIntoPortableText(sampleBlocks, extractedTexts, translations);
      
      expect(updatedBlocks[0].children[0].text).toBe('こんにちは世界！');
      expect(updatedBlocks[0].children[1].text).toBe(' This is a test.'); // Original text preserved
    });
  });

  describe('countCharactersInPortableText', () => {
    it('should count characters in all text spans', () => {
      const count = countCharactersInPortableText(sampleBlocks);
      const expectedCount = 'Hello world!'.length + ' This is a test.'.length + 'Sample Header'.length;
      
      expect(count).toBe(expectedCount);
    });
  });

  describe('Block type checkers', () => {
    it('should identify text blocks correctly', () => {
      expect(isTextBlock(sampleBlocks[0])).toBe(true);
      expect(isTextBlock(sampleBlocks[1])).toBe(false); // Image
      expect(isTextBlock(sampleBlocks[3])).toBe(false); // Code
    });

    it('should identify image blocks correctly', () => {
      expect(isImageBlock(sampleBlocks[0])).toBe(false);
      expect(isImageBlock(sampleBlocks[1])).toBe(true);
      expect(isImageBlock(sampleBlocks[3])).toBe(false);
    });

    it('should identify code blocks correctly', () => {
      expect(isCodeBlock(sampleBlocks[0])).toBe(false);
      expect(isCodeBlock(sampleBlocks[1])).toBe(false);
      expect(isCodeBlock(sampleBlocks[3])).toBe(true);
    });
  });

  describe('extractImageReferences', () => {
    it('should extract image asset references', () => {
      const refs = extractImageReferences(sampleBlocks);
      expect(refs).toEqual(['image-abc123']);
    });

    it('should handle blocks with no images', () => {
      const textOnlyBlocks = [sampleBlocks[0], sampleBlocks[2]];
      const refs = extractImageReferences(textOnlyBlocks);
      expect(refs).toEqual([]);
    });

    it('should extract multiple image references', () => {
      const multiImageBlocks = [
        sampleBlocks[1],
        {
          _type: 'image',
          _key: 'image2',
          asset: { _type: 'reference', _ref: 'image-def456' },
        },
      ];
      
      const refs = extractImageReferences(multiImageBlocks);
      expect(refs).toEqual(['image-abc123', 'image-def456']);
    });
  });

  describe('validatePortableTextStructure', () => {
    it('should validate correct structure', () => {
      const result = validatePortableTextStructure(sampleBlocks);
      
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing _type', () => {
      const invalidBlocks = [
        { _key: 'block1', children: [] }, // Missing _type
      ];
      
      const result = validatePortableTextStructure(invalidBlocks);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Block at index 0 is missing _type');
    });

    it('should detect invalid text block structure', () => {
      const invalidBlocks = [
        {
          _type: 'block',
          _key: 'block1',
          // Missing children array
        },
      ];
      
      const result = validatePortableTextStructure(invalidBlocks);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Text block at index 0 is missing children array');
    });

    it('should detect invalid span structure', () => {
      const invalidBlocks = [
        {
          _type: 'block',
          _key: 'block1',
          children: [
            { _type: 'span', _key: 'span1' }, // Missing text
          ],
        },
      ];
      
      const result = validatePortableTextStructure(invalidBlocks);
      
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Span at block[0].children[0] is missing text string');
    });

    it('should generate warnings for large content', () => {
      const largeBlocks = [
        {
          _type: 'block',
          _key: 'block1',
          children: [
            { _type: 'span', _key: 'span1', text: 'a'.repeat(15000), marks: [] },
          ],
        },
      ];
      
      const result = validatePortableTextStructure(largeBlocks);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('quite large');
    });
  });

  describe('sanitizePortableTextBlocks', () => {
    it('should remove invalid blocks', () => {
      const mixedBlocks = [
        sampleBlocks[0], // Valid
        { _key: 'invalid' }, // Missing _type
        sampleBlocks[1], // Valid
        {
          _type: 'block',
          _key: 'invalid-block',
          // Missing children
        },
      ];
      
      const sanitized = sanitizePortableTextBlocks(mixedBlocks);
      
      expect(sanitized).toHaveLength(2);
      expect(sanitized[0]).toEqual(sampleBlocks[0]);
      expect(sanitized[1]).toEqual(sampleBlocks[1]);
    });

    it('should filter invalid children from text blocks', () => {
      const blockWithInvalidChildren = [
        {
          _type: 'block',
          _key: 'block1',
          children: [
            { _type: 'span', _key: 'span1', text: 'Valid text', marks: [] },
            { _key: 'invalid-span' }, // Missing _type
            { _type: 'span', _key: 'span2' }, // Missing text
            { _type: 'span', _key: 'span3', text: 'Another valid text', marks: [] },
          ],
        },
      ];
      
      const sanitized = sanitizePortableTextBlocks(blockWithInvalidChildren);
      
      expect(sanitized).toHaveLength(1);
      expect(sanitized[0].children).toHaveLength(2);
      expect(sanitized[0].children[0].text).toBe('Valid text');
      expect(sanitized[0].children[1].text).toBe('Another valid text');
    });
  });

  describe('summarizePortableTextContent', () => {
    it('should provide accurate content summary', () => {
      const summary = summarizePortableTextContent(sampleBlocks);
      
      expect(summary.totalBlocks).toBe(4);
      expect(summary.textBlocks).toBe(2);
      expect(summary.imageBlocks).toBe(1);
      expect(summary.codeBlocks).toBe(1);
      expect(summary.otherBlocks).toBe(0);
      expect(summary.totalCharacters).toBe(countCharactersInPortableText(sampleBlocks));
      expect(summary.estimatedApiCost).toBeGreaterThan(0);
    });

    it('should handle empty blocks', () => {
      const summary = summarizePortableTextContent([]);
      
      expect(summary.totalBlocks).toBe(0);
      expect(summary.textBlocks).toBe(0);
      expect(summary.imageBlocks).toBe(0);
      expect(summary.codeBlocks).toBe(0);
      expect(summary.totalCharacters).toBe(0);
      expect(summary.estimatedApiCost).toBe(0);
    });
  });

  describe('convertToSlug', () => {
    it('should convert Japanese text to URL-friendly slug', () => {
      expect(convertToSlug('東京グルメ ラーメン')).toBe('東京グルメ-ラーメン');
      expect(convertToSlug('【金沢グルメ】昔ながらの洋食店でいただくハントンライス')).toBe('金沢グルメ昔ながらの洋食店でいただくハントンライス');
    });

    it('should handle English text with special characters', () => {
      expect(convertToSlug('Best Café & Restaurant!')).toBe('best-cafe-restaurant');
      expect(convertToSlug('New York\'s Amazing Food')).toBe('new-yorks-amazing-food');
    });

    it('should handle accented characters', () => {
      expect(convertToSlug('Café français')).toBe('cafe-francais');
      expect(convertToSlug('España & Portugal')).toBe('espana-portugal');
    });

    it('should remove multiple spaces and special characters', () => {
      expect(convertToSlug('  Multiple   Spaces   Here  ')).toBe('multiple-spaces-here');
      expect(convertToSlug('Special@#$%Characters*&')).toBe('specialcharacters');
    });

    it('should limit length to 50 characters', () => {
      const longText = 'This is a very long text that should be truncated to fifty characters maximum';
      const result = convertToSlug(longText);
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result).toBe('this-is-a-very-long-text-that-should-be-truncated');
    });

    it('should handle empty and whitespace-only input', () => {
      expect(convertToSlug('')).toBe('');
      expect(convertToSlug('   ')).toBe('');
      expect(convertToSlug('---')).toBe('');
    });

    it('should remove consecutive hyphens', () => {
      expect(convertToSlug('Test--Multiple---Hyphens')).toBe('test-multiple-hyphens');
    });
  });
});