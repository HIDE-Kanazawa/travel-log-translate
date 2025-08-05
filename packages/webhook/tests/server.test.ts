import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import WebhookServer from '../src/server';

// Mock @octokit/rest
const mockOctokit = {
  repos: {
    createDispatchEvent: vi.fn(),
  },
};

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => mockOctokit),
}));

describe('WebhookServer', () => {
  let server: WebhookServer;
  let app: any;

  const testEnv = {
    PORT: '3001',
    SANITY_WEBHOOK_SECRET: 'test-webhook-secret',
    GITHUB_TOKEN: 'test-github-token',
    GITHUB_OWNER: 'test-owner',
    GITHUB_REPO: 'test-repo',
    NODE_ENV: 'test',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock environment variables
    Object.entries(testEnv).forEach(([key, value]) => {
      process.env[key] = value;
    });

    server = new WebhookServer();
    app = server.getApp();
  });

  afterEach(() => {
    // Clean up environment variables
    Object.keys(testEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe('health endpoint', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          status: 'healthy',
          version: '0.1.0',
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('Sanity webhook endpoint', () => {
    const validPayload = {
      _id: 'article-123',
      _type: 'article',
      _rev: 'rev-456',
      title: 'Test Article',
      lang: 'ja',
      slug: { current: 'test-article' },
    };

    function createValidSignature(payload: any): string {
      const body = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', testEnv.SANITY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
      return `sha256=${signature}`;
    }

    it('should process valid Japanese article webhook', async () => {
      mockOctokit.repos.createDispatchEvent.mockResolvedValue({ status: 204 });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Translation workflow triggered',
          documentId: 'article-123',
        })
      );

      expect(mockOctokit.repos.createDispatchEvent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        event_type: 'sanity_article_ja',
        client_payload: {
          documentId: 'article-123',
          title: 'Test Article',
          triggeredBy: 'sanity-webhook',
          timestamp: expect.any(String),
        },
      });
    });

    it('should reject webhook without signature', async () => {
      const response = await request(app)
        .post('/webhook/sanity')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid signature' });
      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();
    });

    it('should reject webhook with invalid signature', async () => {
      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', 'sha256=invalid-signature')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid signature' });
    });

    it('should ignore non-Japanese articles', async () => {
      const englishPayload = { ...validPayload, lang: 'en' };

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(englishPayload))
        .send(englishPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Ignored non-Japanese article' });
      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();
    });

    it('should handle invalid payload structure', async () => {
      const invalidPayload = { invalid: 'payload' };

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(invalidPayload))
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Invalid payload',
        })
      );
    });

    it('should handle GitHub API errors', async () => {
      mockOctokit.repos.createDispatchEvent.mockRejectedValue(new Error('GitHub API error'));

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .send(validPayload);

      expect(response.status).toBe(500);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Internal server error',
        })
      );
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalPayload = {
        _id: 'article-456',
        _type: 'article',
        _rev: 'rev-789',
        lang: 'ja',
      };

      mockOctokit.repos.createDispatchEvent.mockResolvedValue({ status: 204 });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(minimalPayload))
        .send(minimalPayload);

      expect(response.status).toBe(200);
      expect(mockOctokit.repos.createDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          client_payload: expect.objectContaining({
            documentId: 'article-456',
            title: undefined, // Should handle missing title
          }),
        })
      );
    });
  });

  describe('manual trigger endpoint', () => {
    it('should trigger workflow manually', async () => {
      mockOctokit.repos.createDispatchEvent.mockResolvedValue({ status: 204 });

      const response = await request(app)
        .post('/trigger/article-789')
        .send({ title: 'Manual Test Article' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Translation workflow triggered',
          documentId: 'article-789',
          dryRun: false,
        })
      );

      expect(mockOctokit.repos.createDispatchEvent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        event_type: 'sanity_article_ja',
        client_payload: {
          documentId: 'article-789',
          title: 'Manual Test Article',
          triggeredBy: 'manual-trigger',
          timestamp: expect.any(String),
        },
      });
    });

    it('should handle dry run mode', async () => {
      const response = await request(app)
        .post('/trigger/article-999')
        .send({ title: 'Dry Run Test', dryRun: true });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Dry run completed',
          documentId: 'article-999',
          dryRun: true,
        })
      );

      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();
    });

    it('should handle GitHub API errors in manual trigger', async () => {
      mockOctokit.repos.createDispatchEvent.mockRejectedValue(new Error('API connection failed'));

      const response = await request(app)
        .post('/trigger/article-error')
        .send({ title: 'Error Test' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Failed to trigger workflow',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Not found',
          path: '/unknown-route',
        })
      );
    });
  });

  describe('HMAC signature verification', () => {
    it('should verify signature correctly', async () => {
      const payload = { test: 'data' };
      const body = JSON.stringify(payload);
      const expectedSignature = crypto
        .createHmac('sha256', testEnv.SANITY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');

      // Test the verification by sending a request
      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', `sha256=${expectedSignature}`)
        .send(payload);

      // Should not be rejected due to signature (will be rejected due to invalid payload structure)
      expect(response.status).not.toBe(401);
    });

    it('should reject tampered payloads', async () => {
      const originalPayload = { _id: 'original', _type: 'article', _rev: 'rev', lang: 'ja' };
      const tamperedPayload = { _id: 'tampered', _type: 'article', _rev: 'rev', lang: 'ja' };
      
      // Create signature for original payload
      const originalSignature = crypto
        .createHmac('sha256', testEnv.SANITY_WEBHOOK_SECRET)
        .update(JSON.stringify(originalPayload))
        .digest('hex');

      // Send tampered payload with original signature
      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', `sha256=${originalSignature}`)
        .send(tamperedPayload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid signature' });
    });

    it('should handle malformed signature header', async () => {
      const testPayload = { _id: 'test', _type: 'article', _rev: 'rev', lang: 'ja' };
      
      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', 'malformed-signature')
        .send(testPayload);

      expect(response.status).toBe(401);
    });
  });
});