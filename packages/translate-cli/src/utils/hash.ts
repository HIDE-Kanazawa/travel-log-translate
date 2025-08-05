import { createHash } from 'crypto';

/**
 * Generate hash for content to detect changes
 */
export function generateContentHash(content: string, frontMatter: Record<string, unknown>): string {
  const hashableContent = JSON.stringify({
    content: content.trim(),
    title: frontMatter.title,
    excerpt: frontMatter.excerpt,
    tags: frontMatter.tags,
  });

  return createHash('sha256').update(hashableContent, 'utf-8').digest('hex');
}

/**
 * Convert slug to kebab-case with language suffix
 */
export function generateSlugWithLang(originalSlug: string, language: string): string {
  // Remove any existing language suffix
  const baseSlug = originalSlug.replace(/-[a-z]{2}(-[a-z]{2})?$/, '');
  return `${baseSlug}-${language}`;
}

/**
 * Translate tags while preserving kebab-case format
 */
export function translateTags(_tags: string[], translations: string[]): string[] {
  return translations.map(translation =>
    translation
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  );
}
