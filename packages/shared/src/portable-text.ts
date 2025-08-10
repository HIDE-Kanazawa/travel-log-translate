import { PortableTextBlock, ExtractedText, SanityImage } from './types.js';

/**
 * Extract text content from Portable Text blocks
 */
export function extractTextsFromPortableText(blocks: PortableTextBlock[]): ExtractedText[] {
  const texts: ExtractedText[] = [];

  blocks.forEach((block, blockIndex) => {
    if (!block.children || !Array.isArray(block.children)) {
      return;
    }

    block.children.forEach((child: any, spanIndex: number) => {
      // Only extract text from span elements
      if (child._type === 'span' && typeof child.text === 'string' && child.text.trim()) {
        texts.push({
          path: `blocks[${blockIndex}].children[${spanIndex}].text`,
          text: child.text,
          blockIndex,
          spanIndex,
        });
      }
    });
  });

  return texts;
}

/**
 * Convert translated text to URL-friendly slug format
 */
export function convertToSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Replace spaces and special characters with hyphens
    .replace(/[\s\-_]+/g, '-')
    // Remove brackets and special characters
    .replace(/[【】\[\]()（）]/g, '')
    // Normalize accented characters to their base form
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove special characters and keep only alphanumeric, hyphens, and Unicode letters
    .replace(/[^a-z0-9\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Limit length to 50 characters for SEO
    .substring(0, 50)
    // Remove trailing hyphen if truncated
    .replace(/-+$/, '');
}

/**
 * Inject translated texts back into Portable Text blocks
 */
export function injectTextsIntoPortableText(
  blocks: PortableTextBlock[],
  extractedTexts: ExtractedText[],
  translations: string[]
): PortableTextBlock[] {
  // Create a deep copy of the blocks
  const updatedBlocks = JSON.parse(JSON.stringify(blocks)) as PortableTextBlock[];

  // Create a map for quick lookup
  const translationMap = new Map<string, string>();
  extractedTexts.forEach((extracted, index) => {
    if (index < translations.length) {
      translationMap.set(extracted.path, translations[index]);
    }
  });

  // Update the blocks with translations
  updatedBlocks.forEach((block, blockIndex) => {
    if (!block.children || !Array.isArray(block.children)) {
      return;
    }

    block.children.forEach((child: any, spanIndex: number) => {
      if (child._type === 'span' && typeof child.text === 'string') {
        const path = `blocks[${blockIndex}].children[${spanIndex}].text`;
        const translation = translationMap.get(path);

        if (translation !== undefined) {
          child.text = translation;
        }
      }
    });
  });

  return updatedBlocks;
}

/**
 * Count characters in Portable Text blocks
 */
export function countCharactersInPortableText(blocks: PortableTextBlock[]): number {
  const texts = extractTextsFromPortableText(blocks);
  return texts.reduce((total, text) => total + text.text.length, 0);
}

/**
 * Check if a Portable Text block is a text block (contains spans)
 */
export function isTextBlock(block: PortableTextBlock): boolean {
  return (
    block._type === 'block' &&
    Array.isArray(block.children) &&
    block.children.some((child: any) => child._type === 'span')
  );
}

/**
 * Check if a Portable Text block is an image block
 */
export function isImageBlock(block: PortableTextBlock): block is SanityImage {
  return block._type === 'image' && 'asset' in block && !!(block as any).asset?._ref;
}

/**
 * Check if a Portable Text block is a code block
 */
export function isCodeBlock(block: PortableTextBlock): boolean {
  return block._type === 'code';
}

/**
 * Extract all unique image references from Portable Text blocks
 */
export function extractImageReferences(blocks: PortableTextBlock[]): string[] {
  const imageRefs: Set<string> = new Set();

  const traverse = (obj: any) => {
    if (typeof obj !== 'object' || obj === null) return;

    if (obj._type === 'image' && obj.asset && typeof obj.asset === 'object' && obj.asset._ref) {
      imageRefs.add(obj.asset._ref);
    }

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach(traverse);
    }
  };

  blocks.forEach(traverse);
  return Array.from(imageRefs);
}

/**
 * Validate Portable Text blocks structure
 */
export function validatePortableTextStructure(blocks: PortableTextBlock[]): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(blocks)) {
    errors.push('Blocks must be an array');
    return { isValid: false, errors, warnings };
  }

  blocks.forEach((block, index) => {
    if (!block._type) {
      errors.push(`Block at index ${index} is missing _type`);
    }

    if (block._type === 'block') {
      if (!Array.isArray(block.children)) {
        errors.push(`Text block at index ${index} is missing children array`);
      } else {
        block.children.forEach((child: any, childIndex: number) => {
          if (!child._type) {
            errors.push(`Child at block[${index}].children[${childIndex}] is missing _type`);
          }

          if (child._type === 'span' && typeof child.text !== 'string') {
            errors.push(`Span at block[${index}].children[${childIndex}] is missing text string`);
          }
        });
      }
    }

    if (block._type === 'image') {
      const imageBlock = block as any;
      if (!imageBlock.asset?._ref) {
        errors.push(`Image block at index ${index} is missing asset reference`);
      }
    }
  });

  // Check for potential issues
  const textBlocks = blocks.filter(isTextBlock);
  if (textBlocks.length === 0) {
    warnings.push('No text blocks found - nothing to translate');
  }

  const totalChars = countCharactersInPortableText(blocks);
  if (totalChars > 10000) {
    warnings.push(
      `Content is quite large (${totalChars} characters) - may consume significant API quota`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Sanitize Portable Text blocks by removing invalid structures
 */
export function sanitizePortableTextBlocks(blocks: PortableTextBlock[]): PortableTextBlock[] {
  return blocks.filter(block => {
    // Remove blocks without _type
    if (!block._type) return false;

    // Validate text blocks
    if (block._type === 'block') {
      if (!Array.isArray(block.children)) return false;

      // Filter out invalid children
      block.children = block.children.filter((child: any) => {
        if (!child._type) return false;
        if (child._type === 'span' && typeof child.text !== 'string') return false;
        return true;
      });
    }

    // Validate image blocks
    if (block._type === 'image') {
      const imageBlock = block as any;
      if (!imageBlock.asset?._ref) return false;
    }

    return true;
  });
}

/**
 * Generate summary of Portable Text content
 */
export function summarizePortableTextContent(blocks: PortableTextBlock[]): {
  totalBlocks: number;
  textBlocks: number;
  imageBlocks: number;
  codeBlocks: number;
  otherBlocks: number;
  totalCharacters: number;
  estimatedApiCost: number; // Rough estimate based on DeepL pricing
} {
  const textBlocks = blocks.filter(isTextBlock).length;
  const imageBlocks = blocks.filter(isImageBlock).length;
  const codeBlocks = blocks.filter(isCodeBlock).length;
  const otherBlocks = blocks.length - textBlocks - imageBlocks - codeBlocks;
  const totalCharacters = countCharactersInPortableText(blocks);

  // Rough estimate: DeepL costs ~$20 per 1M characters
  const estimatedApiCost = (totalCharacters / 1000000) * 20;

  return {
    totalBlocks: blocks.length,
    textBlocks,
    imageBlocks,
    codeBlocks,
    otherBlocks,
    totalCharacters,
    estimatedApiCost,
  };
}
