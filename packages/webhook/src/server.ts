import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';

/**
 * Environment configuration schema
 */
import { SanityArticleClient } from 'shared';
const EnvSchema = z.object({
  PORT: z.string().default('3000'),
  SANITY_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_OWNER: z.string().min(1),
  GITHUB_REPO: z.string().min(1),
  BLOG_GITHUB_OWNER: z.string().optional(),
  BLOG_GITHUB_REPO: z.string().optional(),
  BLOG_REVALIDATE_URL: z.string().optional(),
  BLOG_REVALIDATE_TOKEN: z.string().optional(),
  NODE_ENV: z.string().default('development'),
  // Sanity connection details
  SANITY_PROJECT_ID: z.string().min(1),
  SANITY_DATASET: z.string().min(1),
  SANITY_API_TOKEN: z.string().min(1),
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

/**
 * Webhook server class
 */
class WebhookServer {
  private app: express.Application;
  private octokit: Octokit;
  private config: z.infer<typeof EnvSchema>;
  private sanityClient: SanityArticleClient;

  constructor() {
    // Validate environment
    this.config = EnvSchema.parse(process.env);

    // Initialize GitHub client
    this.octokit = new Octokit({
      auth: this.config.GITHUB_TOKEN,
    });

    // Initialize Sanity client
    const sanityConfig = {
      SANITY_PROJECT_ID: this.config.SANITY_PROJECT_ID,
      SANITY_DATASET: this.config.SANITY_DATASET,
      SANITY_API_TOKEN: this.config.SANITY_API_TOKEN,
      SANITY_API_VERSION: this.config.SANITY_API_VERSION,
      DEEPL_API_KEY: '', // Not needed for webhook
    };
    this.sanityClient = new SanityArticleClient(sanityConfig);

    // Initialize Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Safely retrieve a header value allowing multiple possible names.
   * Express lowercases header keys, so we compare in lowercase.
   */
  private getHeader(req: express.Request, names: string[]): string | undefined {
    for (const name of names) {
      const value = req.headers[name.toLowerCase()];
      if (typeof value === 'string' && value.length > 0) return value;
      if (Array.isArray(value) && value.length > 0) return value[0];
    }
    return undefined;
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security headers
    this.app.use(helmet());

    // CORS
    this.app.use(
      cors({
        origin:
          this.config.NODE_ENV === 'production'
            ? ['https://your-domain.com'] // Replace with your actual domains
            : true,
        credentials: true,
      })
    );

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Raw body parser for webhook signature verification
    this.app.use('/webhook/sanity', express.raw({ type: 'application/json', limit: '1MB' }));

    // JSON parser for other routes
    this.app.use(express.json({ limit: '1MB' }));
  }

  /**
   * Verify Sanity webhook signature
   */
  private verifyWebhookSignature(body: Buffer, signature: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', this.config.SANITY_WEBHOOK_SECRET)
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
   * Check if article should trigger smart translation
   * Conditions: Japanese language + has images + not fully translated
   */
  private async shouldTriggerTranslation(documentId: string): Promise<{
    shouldTrigger: boolean;
    reason: string;
    hasImages: boolean;
    translationStatus?: any;
  }> {
    try {
      // Get the full article document from Sanity
      const article = await this.sanityClient.getArticle(documentId);
      
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

      // Check if article has images (coverImage or gallery)
      const hasImages = !!(article.coverImage || (article.gallery && article.gallery.length > 0));
      
      if (!hasImages) {
        return {
          shouldTrigger: false,
          reason: 'Article has no images',
          hasImages: false,
        };
      }

      // Check translation status for all target languages
      const targetLanguages = [
        'en', 'es', 'fr', 'de', 'it', 'pt-br', 'ru', 'ko', 
        'zh-cn', 'zh-tw', 'ar', 'tr', 'th', 'nl', 'pl', 
        'sv', 'da', 'fi', 'id'
      ];
      const translationStatus = await this.sanityClient.getTranslationStatus(documentId, targetLanguages as any);
      
      // Check if all translations already exist
      const allTranslated = translationStatus.every((status: any) => status.exists);
      
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
        .filter((status: any) => !status.exists)
        .map((status: any) => status.language);

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
   * Trigger blog rebuild via GitHub repository_dispatch and optional revalidate HTTP call.
   * This mirrors the Next.js webhook handler behavior so that production using this server still updates the blog.
   */
  private async triggerBlogUpdate(documentId: string, operation?: string): Promise<void> {
    try {
      const blogOwner = this.config.BLOG_GITHUB_OWNER || this.config.GITHUB_OWNER;
      const blogRepo = this.config.BLOG_GITHUB_REPO || this.config.GITHUB_REPO;

      const event_type = 'sanity_content_changed' as const;
      const payload = {
        event_type,
        client_payload: {
          documentId,
          operation: operation || 'update',
          triggeredBy: 'sanity-webhook-node',
          timestamp: new Date().toISOString(),
        },
      } as const;

      const resp = await this.octokit.repos.createDispatchEvent({
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
      if (this.config.BLOG_REVALIDATE_URL && this.config.BLOG_REVALIDATE_TOKEN) {
        const doFetch = (globalThis as any).fetch as
          | undefined
          | ((input: any, init?: any) => Promise<{ status: number }>);
        if (typeof doFetch === 'function') {
          try {
            const r = await doFetch(this.config.BLOG_REVALIDATE_URL, {
              method: 'POST',
              headers: { Authorization: `Bearer ${this.config.BLOG_REVALIDATE_TOKEN}` },
            });
            console.log('Blog revalidate request sent', { status: r.status });
          } catch (err) {
            console.error('Blog revalidate request failed', {
              message: (err as any)?.message,
              documentId,
            });
          }
        } else {
          console.warn('fetch is not available; skipping blog revalidation');
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

  /**
   * Setup Express routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      });
    });

    // Sanity webhook endpoint
    this.app.post('/webhook/sanity', async (req, res) => {
      try {
        // Verify signature FIRST (security priority)
        const signature = this.getHeader(req, [
          'sanity-webhook-signature',
          'x-sanity-webhook-signature',
          'x-sanity-signature',
        ]) as string;
        if (!signature || !this.verifyWebhookSignature(req.body, signature)) {
          console.warn('Invalid webhook signature', {
            hasSignature: !!signature,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          });
          return res.status(401).json({ error: 'Invalid signature' });
        }

        // Extract Sanity operation type from headers
        const operation = this.getHeader(req, [
          'sanity-operation',
          'x-sanity-operation',
          'x-sanity-event',
        ]) as string;
        const op = operation?.toLowerCase();
        // Allow both 'update' and 'create' (align with Next.js handler); ignore others
        if (op && op !== 'update' && op !== 'create') {
          console.log('Webhook ignored - unsupported operation', {
            operation: op,
            documentId: this.getHeader(req, [
              'sanity-document-id',
              'x-sanity-document-id',
            ]),
          });
          return res.json({
            message: 'Webhook ignored - unsupported operation',
            operation: op,
          });
        }

        // Parse payload
        const rawPayload = JSON.parse(req.body.toString());
        const payload = SanityWebhookPayloadSchema.parse(rawPayload);

        console.log('Webhook received', {
          documentId: payload._id,
          type: payload._type,
          title: payload.title,
          lang: payload.lang,
        });

        // Smart translation trigger - check conditions
        const triggerCheck = await this.shouldTriggerTranslation(payload._id);
        
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
            await this.triggerBlogUpdate(payload._id, op);
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

        await this.octokit.repos.createDispatchEvent({
          owner: this.config.GITHUB_OWNER,
          repo: this.config.GITHUB_REPO,
          ...dispatchPayload,
        });

        console.log('GitHub workflow dispatched', {
          documentId: payload._id,
          owner: this.config.GITHUB_OWNER,
          repo: this.config.GITHUB_REPO,
        });

        

        res.json({
          message: 'Translation workflow triggered',
          documentId: payload._id,
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

        res.status(500).json({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Manual trigger endpoint (for testing)
    this.app.post('/trigger/:documentId', async (req, res) => {
      try {
        const { documentId } = req.params;
        const { title, dryRun = false } = req.body;

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
          await this.octokit.repos.createDispatchEvent({
            owner: this.config.GITHUB_OWNER,
            repo: this.config.GITHUB_REPO,
            ...dispatchPayload,
          });
        }

        res.json({
          message: dryRun ? 'Dry run completed' : 'Translation workflow triggered',
          documentId,
          dryRun,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Manual trigger failed', {
          error: error instanceof Error ? error.message : String(error),
        });

        res.status(500).json({
          error: 'Failed to trigger workflow',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Error handling middleware
    this.app.use(
      (error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
        console.error('Unhandled error', {
          error: error.message,
          stack: error.stack,
          path: req.path,
          method: req.method,
        });

        res.status(500).json({
          error: 'Internal server error',
          timestamp: new Date().toISOString(),
        });
      }
    );

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Start the server
   */
  public start(): void {
    const port = parseInt(this.config.PORT);

    this.app.listen(port, () => {
      console.log(`🚀 Webhook server running on port ${port}`);
      console.log(`📡 Webhook endpoint: http://localhost:${port}/webhook/sanity`);
      console.log(`⚡ Manual trigger: http://localhost:${port}/trigger/:documentId`);
      console.log(`💚 Health check: http://localhost:${port}/health`);
    });
  }

  /**
   * Get Express app instance
   */
  public getApp(): express.Application {
    return this.app;
  }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new WebhookServer();
  server.start();
}

export default WebhookServer;
