// Vercel serverless function entry point
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import { createClient, type SanityClient } from '@sanity/client';
import { TARGET_LANGUAGES, type TargetLanguage } from '../../shared/src/types.js';

// Ensure we can read the raw request body for HMAC verification
export const config = {
  api: {
    bodyParser: false,
  },
};

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
 * Environment configuration schema
 */
const EnvSchema = z.object({
  SANITY_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_OWNER: z.string().min(1),
  GITHUB_REPO: z.string().min(1),
  NODE_ENV: z.string().default('development'),
  DEBUG_SIGNATURE: z.string().optional(),
  // Sanity connection details
  SANITY_PROJECT_ID: z.string().min(1),
  SANITY_DATASET: z.string().min(1),
  SANITY_API_TOKEN: z.string().min(1),
  SANITY_API_VERSION: z.string().default('2024-01-01'),
  // Blog specific GitHub settings (optional)
  BLOG_GITHUB_OWNER: z.string().optional(),
  BLOG_GITHUB_REPO: z.string().optional(),
  BLOG_REVALIDATE_URL: z.string().optional(),
  BLOG_REVALIDATE_TOKEN: z.string().optional(),
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
let appEnv: z.infer<typeof EnvSchema>;
let octokit: Octokit;
let sanityClient: SanityClient;

/**
 * Helper: get first available header value by names (case-insensitive)
 */
function getHeader(req: VercelRequest, names: string[]): string | undefined {
  for (const name of names) {
    const value = req.headers[name.toLowerCase()];
    if (typeof value === 'string' && value.length > 0) return value;
    if (Array.isArray(value) && value.length > 0) return value[0];
  }
  return undefined;
}

/**
 * Helper: read the raw body as Buffer
 * - If body is already a string/Buffer, use it directly
 * - Otherwise, try req.rawBody, or read from the stream
 */
async function getRawBody(req: VercelRequest): Promise<Buffer> {
  const b: any = (req as any).body;
  if (Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') return Buffer.from(b);
  // If body is already parsed as object, fallback to JSON.stringify
  if (b && typeof b === 'object') {
    try {
      return Buffer.from(JSON.stringify(b));
    } catch {}
  }
  const rawBody: any = (req as any).rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody);
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    (req as any)
      .on('data', (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

/**
 * Initialize configuration and clients
 */
function initializeServices() {
  if (!appEnv) {
    appEnv = EnvSchema.parse(process.env);

    octokit = new Octokit({
      auth: appEnv.GITHUB_TOKEN,
    });

    sanityClient = createClient({
      projectId: appEnv.SANITY_PROJECT_ID,
      dataset: appEnv.SANITY_DATASET,
      token: appEnv.SANITY_API_TOKEN,
      apiVersion: appEnv.SANITY_API_VERSION,
      useCdn: false, // We need fresh data for webhooks
    });
  }
}

/**
 * Verify Sanity webhook signature
 */
function timingSafeEqStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return crypto.timingSafeEqual(ab, bb);
}

function verifyWebhookSignature(body: Buffer, signature: string): boolean {
  const received = signature.trim();
  const prefix = 'sha256=';

  // Compute digests
  const hmac = crypto.createHmac('sha256', appEnv.SANITY_WEBHOOK_SECRET).update(body);
  const expectedHex = hmac.digest('hex');
  const hmac2 = crypto.createHmac('sha256', appEnv.SANITY_WEBHOOK_SECRET).update(body);
  const expectedB64 = hmac2.digest('base64');
  // base64url (no padding, +/ -> -_)
  const expectedB64url = expectedB64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const candidates = [
    expectedHex,
    prefix + expectedHex,
    expectedB64,
    prefix + expectedB64,
    expectedB64url,
    prefix + expectedB64url,
  ];

  // Also consider lowercased variant for hex-only values
  const lowercaseReceived = received.startsWith(prefix)
    ? prefix + received.slice(prefix.length).toLowerCase()
    : received.toLowerCase();

  for (const cand of candidates) {
    // Try direct compare
    if (timingSafeEqStr(received, cand)) return true;
    // Try lowercase compare only if candidate looks like hex (length 64 or 71 with prefix)
    const isHexCand = cand.length === 64 || cand.length === 71;
    if (isHexCand && timingSafeEqStr(lowercaseReceived, cand)) return true;
  }
  return false;
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

    // Check if article has images (coverImage or gallery - new schema)
    const hasImages = !!(article as any).coverImage || (!!(article as any).gallery && (article as any).gallery.length > 0);
    
    console.log('Image detection details', {
      documentId,
      coverImage: !!(article as any).coverImage,
      gallery: !!(article as any).gallery && (article as any).gallery.length > 0,
      hasImages,
      availableFields: Object.keys(article).filter(key => !key.startsWith('_'))
    });
    
    if (!hasImages) {
      return {
        shouldTrigger: false,
        reason: 'Article has no images',
        hasImages: false,
      };
    }

    // Check translation status for all target languages
    const targetLanguages: TargetLanguage[] = TARGET_LANGUAGES;
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

/**
 * Trigger blog rebuild via GitHub repository_dispatch
 */
async function triggerBlogUpdate(documentId: string, operation?: string): Promise<void> {
  try {
    const blogOwner = appEnv.BLOG_GITHUB_OWNER || appEnv.GITHUB_OWNER;
    const blogRepo = appEnv.BLOG_GITHUB_REPO || appEnv.GITHUB_REPO;

    const event_type = 'sanity_content_changed' as const;
    const payload = {
      event_type,
      client_payload: {
        documentId,
        operation: operation || 'update',
        triggeredBy: 'sanity-webhook-vercel',
        timestamp: new Date().toISOString(),
      },
    } as const;

    const resp = await octokit.repos.createDispatchEvent({
      owner: blogOwner,
      repo: blogRepo,
      ...payload,
    });

    console.log('Blog repository_dispatch sent', {
      status: resp.status,
      owner: blogOwner,
      repo: blogRepo,
      eventType: event_type,
      documentId,
    });

    // Optional blog revalidation
    if (appEnv.BLOG_REVALIDATE_URL && appEnv.BLOG_REVALIDATE_TOKEN) {
      try {
        const r = await fetch(appEnv.BLOG_REVALIDATE_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${appEnv.BLOG_REVALIDATE_TOKEN}` },
        });
        console.log('Blog revalidate request sent', { status: r.status });
      } catch (err) {
        console.error('Blog revalidate request failed', {
          message: (err as any)?.message,
          documentId,
        });
      }
    }
  } catch (err) {
    console.error('Blog repository_dispatch failed', {
      status: (err as any)?.status ?? (err as any)?.response?.status,
      message: (err as any)?.message,
      documentId,
    });
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

    // Temporary: debug endpoint to compare signature against server-side secret
    if (method === 'POST' && url === '/webhook/debug-signature') {
      if (appEnv.DEBUG_SIGNATURE !== 'true') {
        return res.status(404).json({ error: 'Not found' });
      }
      const provided = getHeader(req, ['x-debug-compare-signature']);
      if (!provided) {
        return res.status(400).json({ error: 'Missing X-Debug-Compare-Signature header' });
      }
      const bodyBuffer: Buffer = (req as any).rawBody instanceof Buffer
        ? (req as any).rawBody
        : await getRawBody(req);
      const expected = 'sha256=' + crypto
        .createHmac('sha256', appEnv.SANITY_WEBHOOK_SECRET)
        .update(bodyBuffer)
        .digest('hex');
      const match = provided === expected;
      return res.json({
        match,
        providedLength: provided.length,
        expectedLength: expected.length,
        expectedPreview: expected.slice(0, 12) + '...' + expected.slice(-4),
      });
    }

    if (method === 'POST' && url === '/webhook/sanity') {
      // Verify signature FIRST (security priority)
      const signature = getHeader(req, [
        'sanity-webhook-signature',
        'x-sanity-webhook-signature',
        'x-sanity-signature',
      ]);
      if (!signature) {
        console.warn('Missing webhook signature', {
          userAgent: req.headers['user-agent'],
        });
        return res.status(401).json({ error: 'Missing signature' });
      }

      const bodyBuffer: Buffer = (req as any).rawBody instanceof Buffer
        ? (req as any).rawBody
        : await getRawBody(req);
      // Lightweight diagnostics to understand body shape (no secrets)
      try {
        console.log('Webhook body diagnostics', {
          bodyType: typeof (req as any).body,
          isBuffer: Buffer.isBuffer((req as any).body),
          rawLen: bodyBuffer.length,
          contentLength: req.headers['content-length'],
          contentType: req.headers['content-type'],
          contentEncoding: req.headers['content-encoding'],
          sigLen: signature.length,
        });
      } catch {}
      if (!verifyWebhookSignature(bodyBuffer, signature)) {
        console.warn('Invalid webhook signature', {
          hasSignature: true,
          userAgent: req.headers['user-agent'],
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Extract Sanity operation type from headers
      const operation = getHeader(req, [
        'sanity-operation',
        'x-sanity-operation',
        'x-sanity-event',
      ]) as string | undefined;

      // Accept 'update' and 'create'. If header is missing, proceed but log it.
      const op = operation?.toLowerCase();
      if (op && op !== 'update' && op !== 'create') {
        console.log('Webhook ignored - unsupported operation', {
          operation: op,
          documentId: getHeader(req, ['sanity-document-id', 'x-sanity-document-id']),
        });
        return res.json({
          message: 'Webhook ignored - unsupported operation',
          operation: op,
        });
      }
      if (!op) {
        console.log('Webhook proceeding - missing operation header, assuming update', {
          documentId: getHeader(req, ['sanity-document-id', 'x-sanity-document-id']),
        });
      }

      // Parse payload using the same raw buffer used for signature verification
      const rawPayload = JSON.parse(bodyBuffer.toString('utf8'));
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
        // Only trigger blog update if translation is complete
        const shouldTriggerBlogUpdate = triggerCheck.hasImages && 
                                       triggerCheck.reason === 'All translations already exist';
        
        if (shouldTriggerBlogUpdate) {
          await triggerBlogUpdate(payload._id, op);
        }
        
        return res.json({ 
          message: 'Smart trigger conditions not met',
          reason: triggerCheck.reason,
          documentId: payload._id,
          hasImages: triggerCheck.hasImages,
          blogUpdateTriggered: shouldTriggerBlogUpdate,
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
        owner: appEnv.GITHUB_OWNER,
        repo: appEnv.GITHUB_REPO,
        ...dispatchPayload,
      });

      console.log('GitHub workflow dispatched', {
        documentId: payload._id,
        owner: appEnv.GITHUB_OWNER,
        repo: appEnv.GITHUB_REPO,
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
          owner: appEnv.GITHUB_OWNER,
          repo: appEnv.GITHUB_REPO,
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