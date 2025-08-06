import { promises as fs } from 'fs';
import path from 'path';
import { ensureDir, move, pathExists } from 'fs-extra';
import type { ArticleMetadata, ArticleStatus } from './types.js';

/**
 * File manager for handling article files and metadata
 */
export class FileManager {
  private contentDir: string;

  constructor(contentDir: string = 'content/articles') {
    this.contentDir = path.resolve(contentDir);
  }

  /**
   * Move article from ready to published directory
   */
  async moveToPublished(
    originalPath: string,
    metadata: ArticleMetadata
  ): Promise<string> {
    try {
      // Create published directory structure: published/YYYY/MM/
      const publishedDate = new Date(metadata.publishedAt);
      const year = publishedDate.getFullYear().toString();
      const month = (publishedDate.getMonth() + 1).toString().padStart(2, '0');
      
      const publishedDir = path.join(this.contentDir, 'published', year, month);
      await ensureDir(publishedDir);

      // Generate new file paths
      const originalFilename = path.basename(originalPath);
      const publishedPath = path.join(publishedDir, originalFilename);
      const metadataPath = path.join(publishedDir, `${path.parse(originalFilename).name}.json`);

      // Move the markdown file
      await move(originalPath, publishedPath);

      // Save metadata JSON
      await this.saveMetadata(metadataPath, {
        ...metadata,
        publishedPath,
      });

      return publishedPath;
    } catch (error) {
      throw new Error(
        `Failed to move article to published directory: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Save article metadata to JSON file
   */
  async saveMetadata(filePath: string, metadata: ArticleMetadata): Promise<void> {
    try {
      await ensureDir(path.dirname(filePath));
      await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to save metadata: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  /**
   * Load article metadata from JSON file
   */
  async loadMetadata(filePath: string): Promise<ArticleMetadata | null> {
    try {
      if (!(await pathExists(filePath))) {
        return null;
      }

      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as ArticleMetadata;
    } catch {
      return null;
    }
  }

  /**
   * List all ready articles
   */
  async listReadyArticles(): Promise<ArticleStatus[]> {
    const readyDir = path.join(this.contentDir, 'ready');
    return this.listArticlesInDirectory(readyDir, 'ready');
  }

  /**
   * List all published articles
   */
  async listPublishedArticles(): Promise<ArticleStatus[]> {
    const publishedDir = path.join(this.contentDir, 'published');
    const articles: ArticleStatus[] = [];

    try {
      // Scan year directories
      const years = await fs.readdir(publishedDir);
      
      for (const year of years) {
        const yearDir = path.join(publishedDir, year);
        const yearStat = await fs.stat(yearDir);
        
        if (!yearStat.isDirectory()) continue;

        // Scan month directories
        const months = await fs.readdir(yearDir);
        
        for (const month of months) {
          const monthDir = path.join(yearDir, month);
          const monthStat = await fs.stat(monthDir);
          
          if (!monthStat.isDirectory()) continue;

          // Get articles from month directory
          const monthArticles = await this.listArticlesInDirectory(monthDir, 'published');
          articles.push(...monthArticles);
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return articles.sort((a, b) => 
      new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
    );
  }

  /**
   * List articles in a specific directory
   */
  private async listArticlesInDirectory(
    directoryPath: string,
    status: 'ready' | 'published'
  ): Promise<ArticleStatus[]> {
    const articles: ArticleStatus[] = [];

    try {
      if (!(await pathExists(directoryPath))) {
        return articles;
      }

      const files = await fs.readdir(directoryPath);
      const markdownFiles = files.filter(file => file.endsWith('.md'));

      for (const file of markdownFiles) {
        const filePath = path.join(directoryPath, file);
        const stat = await fs.stat(filePath);
        
        try {
          // Try to load metadata if it exists (for published articles)
          const metadataPath = path.join(
            directoryPath,
            `${path.parse(file).name}.json`
          );
          const metadata = await this.loadMetadata(metadataPath);

          articles.push({
            path: filePath,
            title: metadata?.title || path.parse(file).name,
            slug: metadata?.slug || path.parse(file).name,
            status,
            lastModified: stat.mtime.toISOString(),
            sanityDocumentId: metadata?.sanityDocumentId,
            translationProgress: metadata?.translationStatus ? {
              completed: metadata.translationStatus.languages.length,
              total: 19, // Target languages
              languages: metadata.translationStatus.languages,
            } : undefined,
          });
        } catch {
          // If we can't get metadata, create basic entry
          articles.push({
            path: filePath,
            title: path.parse(file).name,
            slug: path.parse(file).name,
            status,
            lastModified: stat.mtime.toISOString(),
          });
        }
      }
    } catch {
      // Directory doesn't exist or can't be read
    }

    return articles;
  }

  /**
   * Find article by slug
   */
  async findArticleBySlug(slug: string): Promise<ArticleStatus | null> {
    // Search in ready articles
    const readyArticles = await this.listReadyArticles();
    const readyMatch = readyArticles.find(article => article.slug === slug);
    if (readyMatch) return readyMatch;

    // Search in published articles
    const publishedArticles = await this.listPublishedArticles();
    const publishedMatch = publishedArticles.find(article => article.slug === slug);
    if (publishedMatch) return publishedMatch;

    return null;
  }

  /**
   * Get article metadata by document ID
   */
  async getArticleMetadata(documentId: string): Promise<ArticleMetadata | null> {
    const publishedArticles = await this.listPublishedArticles();
    
    for (const article of publishedArticles) {
      if (article.sanityDocumentId === documentId) {
        const metadataPath = path.join(
          path.dirname(article.path),
          `${path.parse(article.path).name}.json`
        );
        return this.loadMetadata(metadataPath);
      }
    }

    return null;
  }


}