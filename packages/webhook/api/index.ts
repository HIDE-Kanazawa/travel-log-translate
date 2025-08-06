// Vercel serverless function entry point
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import { createClient, type SanityClient } from '@sanity/client';

/**
 * Sanity article type (simplified for webhook needs)
 */
interface SanityArticle {
  _id: string;
  _type: 'article';
  title?: string;
  lang?: string;
  content?: Array<{
    _type: string;
    [key: string]: any;
  }>;
}

/**
 * Target languages for translation
 */
type TargetLanguage = 'en' | 'zh-cn' | 'zh-tw' | 'ko' | 'fr' | 'de' | 'es' | 'it' | 'pt' | 'ru' | 'ar' | 'hi' | 'id' | 'ms' | 'th' | 'vi' | 'tl' | 'tr' | 'br';

/**
 * Environment configuration schema
 */
const EnvSchema = z.object({
  SANITY_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_OWNER: z.string().min(1),
  GITHUB_REPO: z.string().min(1),
  NODE_ENV: z.string().default('development'),
  // Sanity connection details
  SANITY_PROJECT_ID: z.string().min(1),
  SANITY_DATASET: z.string().min(1),
  SANITY_TOKEN: z.string().min(1),
  SANITY_API_VERSION: z.string().default('2024-01-01'),
});

/**
 * Sanity webhook payload schema
 */
const SanityWebhookPayloadSchema = z.object({
  _id: z.string(),
  _type: z.literal('article'),
  _rev: z.string(),
  title: z.string().optional(),
  lang: z.string().optional(),
  slug: z
    .object({
      current: z.string(),
    })
    .optional(),
  // Add content field to detect images
  content: z.array(z.any()).optional(),
});

/**
 * GitHub repository dispatch payload schema
 */
const GitHubDispatchPayloadSchema = z.object({
  event_type: z.literal('sanity_article_ja'),
  client_payload: z.object({
    documentId: z.string(),
    title: z.string().optional(),
    triggeredBy: z.string().default('sanity-webhook'),
    timestamp: z.string(),
    hasImages: z.boolean().optional(),
    translationStatus: z.array(z.any()).optional(),
  }),
});

// Global instances for reuse
let config: z.infer<typeof EnvSchema>;
let octokit: Octokit;
let sanityClient: SanityClient;

/**
 * Initialize configuration and clients
 */
function initializeServices() {
  if (!config) {
    config = EnvSchema.parse(process.env);
    
    octokit = new Octokit({
      auth: config.GITHUB_TOKEN,
    });

    sanityClient = createClient({
      projectId: config.SANITY_PROJECT_ID,
      dataset: config.SANITY_DATASET,
      token: config.SANITY_TOKEN,
      apiVersion: config.SANITY_API_VERSION,
      useCdn: false, // We need fresh data for webhooks
    });
  }
}

/**
 * Verify Sanity webhook signature
 */
function verifyWebhookSignature(body: Buffer, signature: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', config.SANITY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  const expectedSignatureString = `sha256=${expectedSignature}`;

  // Ensure both strings are the same length for timingSafeEqual
  if (signature.length !== expectedSignatureString.length) {
    return false;
  }

  const expectedSignatureBuffer = Buffer.from(expectedSignatureString, 'utf8');
  const receivedSignatureBuffer = Buffer.from(signature, 'utf8');

  return crypto.timingSafeEqual(expectedSignatureBuffer, receivedSignatureBuffer);
}

/**
 * Check if a translation document exists
 */
async function translationExists(baseDocumentId: string, language: TargetLanguage): Promise<boolean> {
  const translatedId = `${baseDocumentId}-${language}`;
  
  try {
    const doc = await sanityClient.getDocument(translatedId);
    return doc !== null;
  } catch {
    return false;
  }
}

/**
 * Get translation status for multiple languages
 */
async function getTranslationStatus(
  baseDocumentId: string,
  languages: TargetLanguage[]
): Promise<Array<{
  language: TargetLanguage;
  exists: boolean;
  documentId: string;
}>> {
  const checks = await Promise.all(
    languages.map(async language => ({
      language,
      exists: await translationExists(baseDocumentId, language),
      documentId: `${baseDocumentId}-${language}`,
    }))
  );
  return checks;
}

/**
 * Check if article should trigger smart translation
 */
async function shouldTriggerTranslation(documentId: string): Promise<{
  shouldTrigger: boolean;
  reason: string;
  hasImages: boolean;
  translationStatus?: any;
}> {
  try {
    // Get article directly from Sanity
    const article = await sanityClient.getDocument(documentId) as SanityArticle | null;
    
    if (!article) {
      return {
        shouldTrigger: false,
        reason: 'Article not found',
        hasImages: false,
      };
    }

    // Check if article is Japanese
    if (article.lang !== 'ja') {
      return {
        shouldTrigger: false,
        reason: `Article language is '${article.lang}', not Japanese`,
        hasImages: false,
      };
    }

    // Check if article has images in content
    const hasImages = article.content?.some((block: any) => block._type === 'image') || false;
    
    if (!hasImages) {
      return {
        shouldTrigger: false,
        reason: 'Article has no images',
        hasImages: false,
      };
    }

    // Check translation status for all target languages
    const targetLanguages: TargetLanguage[] = ['en', 'zh-cn', 'zh-tw', 'ko', 'fr', 'de', 'es', 'it', 'pt', 'ru', 'ar', 'hi', 'id', 'ms', 'th', 'vi', 'tl', 'tr', 'br'];
    const translationStatus = await getTranslationStatus(documentId, targetLanguages);
    
    // Check if all translations already exist
    const allTranslated = translationStatus.every((status) => status.exists);
    
    if (allTranslated) {
      return {
        shouldTrigger: false,
        reason: 'All translations already exist',
        hasImages: true,
        translationStatus,
      };
    }

    // All conditions met - trigger translation
    const missingLanguages = translationStatus
      .filter((status) => !status.exists)
      .map((status) => status.language);

    return {
      shouldTrigger: true,
      reason: `Smart trigger: Japanese article with images, missing translations for: ${missingLanguages.join(', ')}`,
      hasImages: true,
      translationStatus,
    };
  } catch (error) {
    console.error('Error checking translation trigger conditions', {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
    
    return {
      shouldTrigger: false,
      reason: `Error checking conditions: ${error instanceof Error ? error.message : String(error)}`,
      hasImages: false,
    };
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Initialize services
    initializeServices();

    const { method, url } = req;

    // Handle different routes
    if (method === 'GET' && url === '/health') {
      return res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      });
    }

    if (method === 'POST' && url === '/webhook/sanity') {
      // Get raw body
      const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
      
      // Verify signature
      const signature = req.headers['sanity-webhook-signature'] as string;
      if (!signature || !verifyWebhookSignature(bodyBuffer, signature)) {
        console.warn('Invalid webhook signature', {
          hasSignature: !!signature,
          ip: req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Parse payload
      const rawPayload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const payload = SanityWebhookPayloadSchema.parse(rawPayload);

      console.log('Webhook received', {
        documentId: payload._id,
        type: payload._type,
        title: payload.title,
        lang: payload.lang,
      });

      // Smart translation trigger - check conditions
      const triggerCheck = await shouldTriggerTranslation(payload._id);
      
      console.log('Smart translation check', {
        documentId: payload._id,
        shouldTrigger: triggerCheck.shouldTrigger,
        reason: triggerCheck.reason,
        hasImages: triggerCheck.hasImages,
      });

      if (!triggerCheck.shouldTrigger) {
        return res.json({ 
          message: 'Smart trigger conditions not met',
          reason: triggerCheck.reason,
          documentId: payload._id,
          hasImages: triggerCheck.hasImages,
        });
      }

      // Trigger GitHub Actions workflow
      const dispatchPayload = GitHubDispatchPayloadSchema.parse({
        event_type: 'sanity_article_ja',
        client_payload: {
          documentId: payload._id,
          title: payload.title,
          triggeredBy: 'smart-webhook',
          timestamp: new Date().toISOString(),
          hasImages: triggerCheck.hasImages,
          translationStatus: triggerCheck.translationStatus,
        },
      });

      await octokit.repos.createDispatchEvent({
        owner: config.GITHUB_OWNER,
        repo: config.GITHUB_REPO,
        ...dispatchPayload,
      });

      console.log('GitHub workflow dispatched', {
        documentId: payload._id,
        owner: config.GITHUB_OWNER,
        repo: config.GITHUB_REPO,
      });

      return res.json({
        message: 'Translation workflow triggered',
        documentId: payload._id,
        timestamp: new Date().toISOString(),
      });
    }

    // Handle manual trigger
    if (method === 'POST' && url?.startsWith('/trigger/')) {
      const documentId = url.split('/trigger/')[1];
      const { title, dryRun = false } = req.body as any;

      console.log('Manual trigger', { documentId, title, dryRun });

      const dispatchPayload = GitHubDispatchPayloadSchema.parse({
        event_type: 'sanity_article_ja',
        client_payload: {
          documentId,
          title,
          triggeredBy: 'manual-trigger',
          timestamp: new Date().toISOString(),
        },
      });

      if (!dryRun) {
        await octokit.repos.createDispatchEvent({
          owner: config.GITHUB_OWNER,
          repo: config.GITHUB_REPO,
          ...dispatchPayload,
        });
      }

      return res.json({
        message: dryRun ? 'Dry run completed' : 'Translation workflow triggered',
        documentId,
        dryRun,
        timestamp: new Date().toISOString(),
      });
    }

    // 404 for unmatched routes
    return res.status(404).json({
      error: 'Not found',
      path: url,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Webhook processing failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: error.errors,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}