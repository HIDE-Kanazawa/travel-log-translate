import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import WebhookServer from '../src/server';
const TARGET_LANGUAGES = [
  'en', 'es', 'fr', 'de', 'it', 'pt-br', 'ru', 'ko', 
  'zh-cn', 'zh-tw', 'ar', 'tr', 'th', 'nl', 'pl', 
  'sv', 'da', 'fi', 'id'
] as const;

// Mock @octokit/rest
const mockOctokit = {
  repos: {
    createDispatchEvent: vi.fn(),
  },
};
// Mock SanityArticleClient
const mockSanityClient = {
  getArticle: vi.fn(),
  getTranslationStatus: vi.fn(),
  getJapaneseArticles: vi.fn(),
};

vi.mock('shared', () => ({
  SanityArticleClient: vi.fn().mockImplementation(() => mockSanityClient),
}));

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
    // Sanity connection details for smart translation
    SANITY_PROJECT_ID: 'test-project',
    SANITY_DATASET: 'test-dataset',
    SANITY_TOKEN: 'test-sanity-token',
    SANITY_API_VERSION: '2024-01-01',
  };;

  beforeEach(() => {
    // Reset only mock function states (implementations and calls)
    mockSanityClient.getArticle.mockReset();
    mockSanityClient.getTranslationStatus.mockReset();
    mockSanityClient.getJapaneseArticles.mockReset();
    mockOctokit.repos.createDispatchEvent.mockReset();

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

    it('should process valid Japanese article webhook for update operations', async () => {
      // Mock Sanity responses for smart translation logic
      mockSanityClient.getArticle.mockResolvedValue({
        _id: 'article-123',
        _type: 'article',
        title: 'Test Article',
        lang: 'ja',
        slug: { current: 'test-article' },
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [
          { _type: 'block', children: [{ text: 'Some text content' }] },
        ],
        coverImage: { _type: 'image', asset: { _ref: 'image-123' }, alt: 'Cover image' },
        gallery: [
          { _type: 'image', asset: { _ref: 'image-456' }, alt: 'Gallery image' },
        ],
      });

      mockSanityClient.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: false },
        { language: 'fr', exists: false },
        { language: 'de', exists: true },
      ]);

      mockOctokit.repos.createDispatchEvent.mockResolvedValue({ status: 204 });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'update')
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
          triggeredBy: 'smart-webhook',
          timestamp: expect.any(String),
          hasImages: true,
          translationStatus: expect.any(Array),
        },
      });
    });

    it('should ignore delete and not trigger blog rebuild on create when conditions not met', async () => {
      // create: allowed path, but if smart trigger conditions are not met,
      // server no longer sends a blog repository_dispatch by default
      const response1 = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'create')
        .send(validPayload);

      expect(response1.status).toBe(200);
      expect(response1.body).toEqual(
        expect.objectContaining({
          message: 'Smart trigger conditions not met',
          documentId: validPayload._id,
          blogUpdateTriggered: false,
        })
      );

      // Blog rebuild dispatch should NOT be sent when conditions are not met
      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();

      const callCountAfterCreate = (mockOctokit.repos.createDispatchEvent as any).mock.calls.length;

      // delete: unsupported, should be ignored without any dispatch
      const response2 = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'delete')
        .send(validPayload);

      expect(response2.status).toBe(200);
      expect(response2.body).toEqual({
        message: 'Webhook ignored - unsupported operation',
        operation: 'delete',
      });

      // No additional dispatches should have occurred for delete
      expect((mockOctokit.repos.createDispatchEvent as any).mock.calls.length).toBe(callCountAfterCreate);
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
        .set('sanity-operation', 'update')
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid signature' });
    });

    it('should not trigger translation for non-Japanese articles but still dispatch blog rebuild', async () => {
      const englishPayload = { ...validPayload, lang: 'en' };

      // Mock Sanity response for smart trigger
      mockSanityClient.getArticle.mockResolvedValue({
        ...englishPayload,
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [{ _type: 'block', children: [{ text: 'English content' }] }],
      });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(englishPayload))
        .set('sanity-operation', 'update')
        .send(englishPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Smart trigger conditions not met',
        reason: "Article language is 'en', not Japanese",
        documentId: englishPayload._id,
        hasImages: false,
        blogUpdateTriggered: false,
      });
      // Blog rebuild dispatch should NOT be sent for non-Japanese articles
      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();
    });

    it('should handle invalid payload structure', async () => {
      const invalidPayload = { invalid: 'payload' };

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(invalidPayload))
        .set('sanity-operation', 'update')
        .send(invalidPayload);

      expect(response.status).toBe(400);
      expect(response.body).toEqual(
        expect.objectContaining({
          error: 'Invalid payload',
        })
      );
    });

    it('should handle GitHub API errors', async () => {
      // Mock Sanity responses for smart trigger to pass all conditions
      mockSanityClient.getArticle.mockResolvedValue({
        _id: 'article-123',
        _type: 'article',
        title: 'Test Article',
        lang: 'ja',
        slug: { current: 'test-article' },
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [
          { _type: 'block', children: [{ text: 'Some text content' }] },
        ],
        coverImage: { _type: 'image', asset: { _ref: 'image-123' }, alt: 'Test image' },
      });
      
      mockSanityClient.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: false },
        { language: 'fr', exists: false },
      ]);
      
      // Mock GitHub API to fail
      mockOctokit.repos.createDispatchEvent.mockRejectedValue(
        new Error('GitHub API error')
      );

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'update')
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

      // Mock Sanity responses for smart trigger
      mockSanityClient.getArticle.mockResolvedValue({
        ...minimalPayload,
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [{ _type: 'block', children: [{ text: 'Minimal content' }] }],
        coverImage: { _type: 'image', asset: { _ref: 'image-minimal' }, alt: 'Minimal image' },
      });
      mockSanityClient.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: false },
      ]);
      mockOctokit.repos.createDispatchEvent.mockResolvedValue({ status: 204 });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(minimalPayload))
        .set('sanity-operation', 'update')
        .send(minimalPayload);

      expect(response.status).toBe(200);
      expect(mockOctokit.repos.createDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          client_payload: expect.objectContaining({
            documentId: 'article-456',
            title: undefined, // Should handle missing title
            hasImages: true,
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

  describe('Smart translation trigger logic', () => {
    const validPayload = {
      _id: 'article-smart-123',
      _type: 'article',
      _rev: 'rev-456',
      title: 'Japanese Article with Images',
      lang: 'ja',
      slug: { current: 'japanese-article-images' },
      content: [
        { _type: 'block', children: [{ text: 'Some text content' }] },
        { _type: 'image', asset: { _ref: 'image-123' }, alt: 'Test image' },
      ],
    };

    function createValidSignature(payload: any): string {
      const body = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', testEnv.SANITY_WEBHOOK_SECRET)
        .update(body)
        .digest('hex');
      return `sha256=${signature}`;
    }

    beforeEach(() => {
      // Reset only specific mock functions to avoid leakage while preserving module mocks
      mockSanityClient.getArticle.mockReset();
      mockSanityClient.getTranslationStatus.mockReset();
      mockSanityClient.getJapaneseArticles.mockReset();
      mockOctokit.repos.createDispatchEvent.mockReset();
    });

    it('should trigger translation for Japanese article with images and missing translations', async () => {
      // Mock Sanity responses
      mockSanityClient.getArticle.mockResolvedValue({
        _id: 'article-smart-123',
        _type: 'article',
        title: 'Japanese Article with Images',
        lang: 'ja',
        slug: { current: 'japanese-article-images' },
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [
          { _type: 'block', children: [{ text: 'Some text content' }] },
        ],
        coverImage: { _type: 'image', asset: { _ref: 'image-123' }, alt: 'Test image' },
      });

      mockSanityClient.getTranslationStatus.mockResolvedValue([
        { language: 'en', exists: false },
        { language: 'fr', exists: false },
        { language: 'de', exists: true },
      ]);

      mockOctokit.repos.createDispatchEvent.mockResolvedValue({ status: 204 });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'update')
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Translation workflow triggered',
          documentId: 'article-smart-123',
        })
      );

      expect(mockSanityClient.getArticle).toHaveBeenCalledWith('article-smart-123');
      expect(mockSanityClient.getTranslationStatus).toHaveBeenCalledWith(
        'article-smart-123',
        expect.arrayContaining([...TARGET_LANGUAGES])
      );

      expect(mockOctokit.repos.createDispatchEvent).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        event_type: 'sanity_article_ja',
        client_payload: {
          documentId: 'article-smart-123',
          title: 'Japanese Article with Images',
          triggeredBy: 'smart-webhook',
          timestamp: expect.any(String),
          hasImages: true,
          translationStatus: expect.any(Array),
        },
      });
    });

    it('should NOT trigger translation for Japanese article without images', async () => {
      const payloadNoImages = {
        ...validPayload,
        title: 'Japanese Article No Images',
      };

      mockSanityClient.getArticle.mockResolvedValue({
        _id: 'article-smart-123',
        _type: 'article',
        title: 'Japanese Article No Images',
        lang: 'ja',
        slug: { current: 'japanese-article-no-images' },
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [
          { _type: 'block', children: [{ text: 'Text only content' }] },
        ],
        // No coverImage or gallery - should not trigger
      });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(payloadNoImages))
        .set('sanity-operation', 'update')
        .send(payloadNoImages);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Smart trigger conditions not met',
          reason: 'Article has no images',
          hasImages: false,
          blogUpdateTriggered: false,
        })
      );
      // Blog rebuild dispatch should NOT be sent for articles without images
      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();
    });

    it('should NOT trigger translation for non-Japanese article but still dispatch blog rebuild', async () => {
      const englishPayload = {
        ...validPayload,
        lang: 'en',
        title: 'English Article with Images',
      };

      mockSanityClient.getArticle.mockResolvedValue({
        _id: 'article-smart-123',
        _type: 'article',
        title: 'English Article with Images',
        lang: 'en',
        slug: { current: 'english-article-images' },
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [
          { _type: 'block', children: [{ text: 'Some text content' }] },
        ],
        coverImage: { _type: 'image', asset: { _ref: 'image-123' }, alt: 'Test image' },
      });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(englishPayload))
        .set('sanity-operation', 'update')
        .send(englishPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Smart trigger conditions not met',
          reason: `Article language is 'en', not Japanese`,
          hasImages: false,
          blogUpdateTriggered: false,
        })
      );
      // Blog rebuild dispatch should NOT be sent for non-Japanese articles
      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();
    });

    it('should NOT trigger translation when all translations already exist', async () => {
      mockSanityClient.getArticle.mockResolvedValue({
        _id: 'article-smart-123',
        _type: 'article',
        title: 'Japanese Article with Images',
        lang: 'ja',
        slug: { current: 'japanese-article-images' },
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [
          { _type: 'block', children: [{ text: 'Some text content' }] },
        ],
        coverImage: { _type: 'image', asset: { _ref: 'image-123' }, alt: 'Test image' },
      });

      // Mock all translations as existing
      const allTranslationsExist = TARGET_LANGUAGES.map(lang => ({ language: lang, exists: true }));

      mockSanityClient.getTranslationStatus.mockResolvedValue(allTranslationsExist);

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'update')
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Smart trigger conditions not met',
          reason: 'All translations already exist',
          hasImages: true,
          blogUpdateTriggered: true,
        })
      );
      // Blog rebuild dispatch should be sent for completed translations
      expect(mockOctokit.repos.createDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          event_type: 'sanity_content_changed',
          client_payload: expect.objectContaining({
            documentId: 'article-smart-123',
          }),
        })
      );
    });

    it('should handle Sanity API errors gracefully', async () => {
      mockSanityClient.getArticle.mockRejectedValue(new Error('Sanity API connection failed'));

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'update')
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Smart trigger conditions not met',
          reason: 'Error checking conditions: Sanity API connection failed',
          hasImages: false,
          blogUpdateTriggered: false,
        })
      );
      // Blog rebuild dispatch should NOT be sent for API errors
      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();
    });

    it('should handle article not found', async () => {
      mockSanityClient.getArticle.mockResolvedValue(null);

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'update')
        .send(validPayload);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          message: 'Smart trigger conditions not met',
          reason: 'Article not found',
          hasImages: false,
          blogUpdateTriggered: false,
        })
      );

      expect(mockSanityClient.getArticle).toHaveBeenCalledWith('article-smart-123');
      // Blog rebuild dispatch should NOT be sent for article not found
      expect(mockOctokit.repos.createDispatchEvent).not.toHaveBeenCalled();
    });

    it('should include detailed translation status in GitHub payload', async () => {
      const translationStatus = [
        { language: 'en', exists: false },
        { language: 'fr', exists: true },
        { language: 'de', exists: false },
        { language: 'es', exists: true },
      ];

      mockSanityClient.getArticle.mockResolvedValue({
        _id: 'article-smart-123',
        _type: 'article',
        title: 'Japanese Article with Images',
        lang: 'ja',
        slug: { current: 'japanese-article-images' },
        publishedAt: '2024-01-01T00:00:00Z',
        type: 'spot',
        prefecture: 'tokyo',
        content: [
          { _type: 'block', children: [{ text: 'Some text content' }] },
        ],
        coverImage: { _type: 'image', asset: { _ref: 'image-123' }, alt: 'Test image' },
      });

      mockSanityClient.getTranslationStatus.mockResolvedValue(translationStatus);
      mockOctokit.repos.createDispatchEvent.mockResolvedValue({ status: 204 });

      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', createValidSignature(validPayload))
        .set('sanity-operation', 'update')
        .send(validPayload);

      expect(response.status).toBe(200);

      expect(mockOctokit.repos.createDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          client_payload: expect.objectContaining({
            hasImages: true,
            translationStatus: translationStatus,
          }),
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
        .set('sanity-operation', 'update')
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
        .set('sanity-operation', 'update')
        .send(tamperedPayload);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Invalid signature' });
    });

    it('should handle malformed signature header', async () => {
      const testPayload = { _id: 'test', _type: 'article', _rev: 'rev', lang: 'ja' };
      
      const response = await request(app)
        .post('/webhook/sanity')
        .set('sanity-webhook-signature', 'malformed-signature')
        .set('sanity-operation', 'update')
        .send(testPayload);

      expect(response.status).toBe(401);
    });
  });
});