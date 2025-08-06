import matter from 'gray-matter';
import { promises as fs } from 'fs';
import path from 'path';
import { ArticleFrontMatterSchema, type ParsedArticle, type ArticleFrontMatter } from './types.js';

/**
 * Markdown parser for travel blog articles
 */
export class MarkdownParser {
  /**
   * Parse a markdown file and validate its front-matter
   */
  async parseFile(filePath: string): Promise<ParsedArticle> {
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Parse front-matter and content
      const parsed = matter(content);
      
      // Validate front-matter
      const frontMatter = this.validateFrontMatter(parsed.data);
      
      // Calculate content length
      const contentLength = parsed.content.length + 
        (frontMatter.title?.length || 0) +
        (''?.length || 0);
      
      // Check content length limit (15,000 characters)
      if (contentLength > 15000) {
        throw new Error(
          `Article content exceeds 15,000 character limit (${contentLength} characters). ` +
          'Please shorten the article before publishing.'
        );
      }
      
      return {
        frontMatter,
        content: parsed.content.trim(),
        originalPath: filePath,
        contentLength,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to parse markdown file "${filePath}": ${error.message}`);
      }
      throw new Error(`Failed to parse markdown file "${filePath}": Unknown error`);
    }
  }

  /**
   * Validate front-matter against schema
   */
  private validateFrontMatter(data: any): ArticleFrontMatter {
    try {
      return ArticleFrontMatterSchema.parse(data);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Invalid front-matter: ${error.message}`);
      }
      throw new Error('Invalid front-matter: Unknown validation error');
    }
  }

  /**
   * Validate multiple files and return validation results
   */
  async validateFiles(filePaths: string[]): Promise<{
    valid: ParsedArticle[];
    invalid: { path: string; error: string }[];
  }> {
    const valid: ParsedArticle[] = [];
    const invalid: { path: string; error: string }[] = [];

    for (const filePath of filePaths) {
      try {
        const parsed = await this.parseFile(filePath);
        valid.push(parsed);
      } catch (error) {
        invalid.push({
          path: filePath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { valid, invalid };
  }

  /**
   * Extract image references from markdown content
   */
  extractImageReferences(content: string): string[] {
    const imageRegex = /!\[.*?\]\(([^)]+)\)/g;
    const images: string[] = [];
    let match;

    while ((match = imageRegex.exec(content)) !== null) {
      images.push(match[1]);
    }

    return images;
  }

  /**
   * Get article summary for display
   */
  getArticleSummary(article: ParsedArticle): {
    title: string;
    slug: string;
    contentLength: number;
    tags: string[] | undefined;
    imageCount: number;
  } {
    const imageReferences = this.extractImageReferences(article.content);
    
    return {
      title: article.frontMatter.title,
      slug: article.frontMatter.slug,
      contentLength: article.contentLength,
      tags: article.frontMatter.tags,
      imageCount: imageReferences.length,
    };
  }

  /**
   * Check if article slug is unique in a directory
   */
  async checkSlugUniqueness(
    slug: string, 
    directoryPath: string, 
    excludePath?: string
  ): Promise<boolean> {
    try {
      const files = await fs.readdir(directoryPath);
      const markdownFiles = files.filter(file => 
        file.endsWith('.md') && 
        (excludePath ? path.join(directoryPath, file) !== excludePath : true)
      );

      for (const file of markdownFiles) {
        const filePath = path.join(directoryPath, file);
        try {
          const parsed = await this.parseFile(filePath);
          if (parsed.frontMatter.slug === slug) {
            return false;
          }
        } catch {
          // Skip files that can't be parsed
          continue;
        }
      }

      return true;
    } catch {
      // If directory doesn't exist or can't be read, consider slug unique
      return true;
    }
  }
}