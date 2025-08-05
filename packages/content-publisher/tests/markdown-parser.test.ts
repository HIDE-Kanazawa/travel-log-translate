import { describe, it, expect, beforeEach } from 'vitest';
import { MarkdownParser } from '../src/markdown-parser.js';
import { promises as fs } from 'fs';
import path from 'path';
import { ensureDir, remove } from 'fs-extra';

describe('MarkdownParser', () => {
  let parser: MarkdownParser;
  let testDir: string;

  beforeEach(async () => {
    parser = new MarkdownParser();
    testDir = path.join(process.cwd(), 'test-output', 'markdown-parser');
    await ensureDir(testDir);
  });

  afterEach(async () => {
    await remove(testDir);
  });

  describe('parseFile', () => {
    it('should parse valid markdown file correctly', async () => {
      const testFile = path.join(testDir, 'valid-article.md');
      const content = `---
title: "Test Article"
excerpt: "This is a test article"
tags:
  - test
  - article
lang: ja
slug: test-article
date: '2024-01-15'
author: Test Author
---

# Test Article

This is the content of the test article.`;

      await fs.writeFile(testFile, content);

      const result = await parser.parseFile(testFile);

      expect(result.frontMatter.title).toBe('Test Article');
      expect(result.frontMatter.excerpt).toBe('This is a test article');
      expect(result.frontMatter.tags).toEqual(['test', 'article']);
      expect(result.frontMatter.lang).toBe('ja');
      expect(result.frontMatter.slug).toBe('test-article');
      expect(result.content).toBe('# Test Article\n\nThis is the content of the test article.');
      expect(result.originalPath).toBe(testFile);
      expect(result.contentLength).toBeGreaterThan(0);
    });

    it('should reject invalid front-matter', async () => {
      const testFile = path.join(testDir, 'invalid-article.md');
      const content = `---
title: ""
lang: en
---

# Invalid Article`;

      await fs.writeFile(testFile, content);

      await expect(parser.parseFile(testFile)).rejects.toThrow('Invalid front-matter');
    });

    it('should reject content exceeding 15,000 characters', async () => {
      const testFile = path.join(testDir, 'long-article.md');
      const longContent = 'A'.repeat(15001);
      const content = `---
title: "Long Article"
excerpt: "This is a very long article"
tags:
  - test
lang: ja
slug: long-article
date: '2024-01-15'
author: Test Author
---

${longContent}`;

      await fs.writeFile(testFile, content);

      await expect(parser.parseFile(testFile)).rejects.toThrow(
        'Article content exceeds 15,000 character limit'
      );
    });
  });

  describe('extractImageReferences', () => {
    it('should extract image references from markdown', () => {
      const content = `
# Article with images

![Image 1](./images/image1.jpg)

Some text here.

![Image 2](../assets/image2.png)
`;

      const images = parser.extractImageReferences(content);
      expect(images).toEqual(['./images/image1.jpg', '../assets/image2.png']);
    });

    it('should return empty array for content without images', () => {
      const content = '# Article without images\n\nJust text here.';
      const images = parser.extractImageReferences(content);
      expect(images).toEqual([]);
    });
  });

  describe('validateFiles', () => {
    it('should validate multiple files and separate valid from invalid', async () => {
      // Create valid file
      const validFile = path.join(testDir, 'valid.md');
      const validContent = `---
title: "Valid Article"
excerpt: "Valid content"
tags: [test]
lang: ja
slug: valid
date: '2024-01-15'
author: Author
---

Content`;

      await fs.writeFile(validFile, validContent);

      // Create invalid file
      const invalidFile = path.join(testDir, 'invalid.md');
      const invalidContent = `---
title: ""
lang: invalid
---

Content`;

      await fs.writeFile(invalidFile, invalidContent);

      const result = await parser.validateFiles([validFile, invalidFile]);

      expect(result.valid).toHaveLength(1);
      expect(result.invalid).toHaveLength(1);
      expect(result.valid[0].frontMatter.title).toBe('Valid Article');
      expect(result.invalid[0].path).toBe(invalidFile);
      expect(result.invalid[0].error).toContain('Invalid front-matter');
    });
  });
});