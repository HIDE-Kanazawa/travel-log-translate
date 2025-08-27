// Types
export * from './types.js';

// DeepL client
export { DeepLClient } from './deepl-client.js';

// Sanity client
export { SanityArticleClient } from './sanity-client.js';

// Portable Text utilities
export * from './portable-text.js';

// Utility functions
export function validateEnvironment(env: Record<string, string | undefined>) {
  const required = ['DEEPL_API_KEY', 'SANITY_PROJECT_ID', 'SANITY_DATASET', 'SANITY_API_TOKEN'];

  const missing = required.filter(key => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return {
    DEEPL_API_KEY: env.DEEPL_API_KEY!,
    SANITY_PROJECT_ID: env.SANITY_PROJECT_ID!,
    SANITY_DATASET: env.SANITY_DATASET!,
    SANITY_API_TOKEN: env.SANITY_API_TOKEN!,
    SANITY_API_VERSION: env.SANITY_API_VERSION || '2024-01-01',
  };
}

export function formatCharacterCount(count: number): string {
  if (count < 1000) return `${count} chars`;
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K chars`;
  return `${(count / 1000000).toFixed(2)}M chars`;
}

export function estimateApiCost(characterCount: number, pricePerMillion = 20): number {
  return (characterCount / 1000000) * pricePerMillion;
}
