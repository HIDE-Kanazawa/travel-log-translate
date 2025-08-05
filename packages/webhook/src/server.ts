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
const EnvSchema = z.object({
  PORT: z.string().default('3000'),
  SANITY_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_OWNER: z.string().min(1),
  GITHUB_REPO: z.string().min(1),
  NODE_ENV: z.string().default('development'),
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
  }),
});

/**
 * Webhook server class
 */
class WebhookServer {
  private app: express.Application;
  private octokit: Octokit;
  private config: z.infer<typeof EnvSchema>;

  constructor() {
    // Validate environment
    this.config = EnvSchema.parse(process.env);

    // Initialize GitHub client
    this.octokit = new Octokit({
      auth: this.config.GITHUB_TOKEN,
    });

    // Initialize Express app
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
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
        // Verify signature
        const signature = req.headers['sanity-webhook-signature'] as string;
        if (!signature || !this.verifyWebhookSignature(req.body, signature)) {
          console.warn('Invalid webhook signature', {
            hasSignature: !!signature,
            ip: req.ip,
            userAgent: req.headers['user-agent'],
          });
          return res.status(401).json({ error: 'Invalid signature' });
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

        // Only process Japanese articles
        if (payload.lang !== 'ja') {
          console.log('Ignoring non-Japanese article', {
            documentId: payload._id,
            lang: payload.lang,
          });
          return res.json({ message: 'Ignored non-Japanese article' });
        }

        // Trigger GitHub Actions workflow
        const dispatchPayload = GitHubDispatchPayloadSchema.parse({
          event_type: 'sanity_article_ja',
          client_payload: {
            documentId: payload._id,
            title: payload.title,
            triggeredBy: 'sanity-webhook',
            timestamp: new Date().toISOString(),
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
