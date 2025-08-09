import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';
import { z } from 'zod';
import { Octokit } from '@octokit/rest';
import { createClient, type SanityClient } from '@sanity/client';

export const config = {
  api: {
    bodyParser: false,
  },
};

// ----- Schemas -----
const EnvSchema = z.object({
  SANITY_WEBHOOK_SECRET: z.string().min(1),
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_OWNER: z.string().min(1),
  GITHUB_REPO: z.string().min(1),
  NODE_ENV: z.string().default('development'),
  DEBUG_SIGNATURE: z.string().optional(),
  SANITY_PROJECT_ID: z.string().min(1),
  SANITY_DATASET: z.string().min(1),
  SANITY_TOKEN: z.string().min(1),
  SANITY_API_VERSION: z.string().default('2024-01-01'),
});

const SanityWebhookPayloadSchema = z.object({
  _id: z.string(),
  _type: z.literal('article'),
  _rev: z.string(),
  title: z.string().optional(),
  lang: z.string().optional(),
  slug: z.object({ current: z.string() }).optional(),
  content: z.array(z.any()).optional(),
});

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

// ----- Singletons -----
let appEnv: z.infer<typeof EnvSchema> | undefined;
let octokit: Octokit;
let sanityClient: SanityClient;

function init() {
  if (appEnv) return;
  appEnv = EnvSchema.parse(process.env);
  octokit = new Octokit({ auth: appEnv.GITHUB_TOKEN });
  sanityClient = createClient({
    projectId: appEnv.SANITY_PROJECT_ID,
    dataset: appEnv.SANITY_DATASET,
    token: appEnv.SANITY_TOKEN,
    apiVersion: appEnv.SANITY_API_VERSION,
    useCdn: false,
  });
}

// ----- Utils -----
function getHeader(req: NextApiRequest, names: string[]): string | undefined {
  for (const name of names) {
    const v = req.headers[name.toLowerCase() as keyof typeof req.headers];
    if (typeof v === 'string' && v.length > 0) return v;
    if (Array.isArray(v) && v.length > 0) return v[0];
  }
  return undefined;
}

function getHeaderWithName(
  req: NextApiRequest,
  names: string[],
): { name: string; value: string } | undefined {
  for (const name of names) {
    const v = req.headers[name.toLowerCase() as keyof typeof req.headers];
    if (typeof v === 'string' && v.length > 0) return { name, value: v };
    if (Array.isArray(v) && v.length > 0) return { name, value: v[0] };
  }
  return undefined;
}

async function readRawBody(req: NextApiRequest): Promise<Buffer> {
  // With bodyParser disabled, req is a stream
  const chunks: Buffer[] = [];
  return await new Promise<Buffer>((resolve, reject) => {
    (req as any)
      .on('data', (chunk: any) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

function timingSafeEqStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return crypto.timingSafeEqual(ab, bb);
}

function verifySignature(body: Buffer, sig: string): boolean {
  if (!appEnv) return false;
  const received = sig.trim();
  const prefix = 'sha256=';
  const hmac = crypto.createHmac('sha256', appEnv.SANITY_WEBHOOK_SECRET).update(body);
  const expectedHex = hmac.digest('hex');
  const hmac2 = crypto.createHmac('sha256', appEnv.SANITY_WEBHOOK_SECRET).update(body);
  const expectedB64 = hmac2.digest('base64');
  const expectedB64url = expectedB64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const candidates = [
    expectedHex,
    prefix + expectedHex,
    expectedB64,
    prefix + expectedB64,
    expectedB64url,
    prefix + expectedB64url,
  ];
  const lowercaseReceived = received.startsWith(prefix)
    ? prefix + received.slice(prefix.length).toLowerCase()
    : received.toLowerCase();

  // Optional diagnostics (no secrets)
  if (appEnv.DEBUG_SIGNATURE === 'true') {
    try {
      console.log('Signature diagnostics', {
        receivedLen: received.length,
        hasPrefix: received.startsWith(prefix),
        looksHex: /^[a-f0-9]+$/i.test(received.replace(/^sha256=/, '')),
        looksBase64: /^(sha256=)?[A-Za-z0-9+/=]+$/.test(received),
        looksBase64url: /^(sha256=)?[A-Za-z0-9_-]+$/.test(received),
        expectedHexLen: expectedHex.length,
        expectedB64Len: expectedB64.length,
        expectedB64urlLen: expectedB64url.length,
      });
    } catch {}
  }
  for (const cand of candidates) {
    if (timingSafeEqStr(received, cand)) return true;
    const isHexCand = cand.length === 64 || cand.length === 71;
    if (isHexCand && timingSafeEqStr(lowercaseReceived, cand)) return true;
  }
  return false;
}

async function shouldTriggerTranslation(documentId: string) {
  if (!appEnv) throw new Error('env not initialized');
  // Language must be ja and must have coverImage or gallery images
  const query = `*[_type=='article' && _id==$id][0]{
    _id,
    lang,
    coverImage,
    gallery
  }`;
  const doc = await sanityClient.fetch<any>(query, { id: documentId });
  const langOk = doc?.lang === 'ja';
  const hasCover = !!doc?.coverImage;
  const hasGallery = Array.isArray(doc?.gallery) && doc.gallery.length > 0;
  const hasImages = hasCover || hasGallery;
  const translationStatus: any[] = [];
  return { shouldTrigger: !!(langOk && hasImages), hasImages, translationStatus };
}

// ----- Handler -----
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  init();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Signature header
  const sigHeader = getHeaderWithName(req, [
    'sanity-webhook-signature',
    'x-sanity-webhook-signature',
    'x-sanity-signature',
  ]);
  if (!sigHeader) {
    console.warn('Missing webhook signature', { ua: req.headers['user-agent'] });
    return res.status(401).json({ error: 'Missing signature' });
  }
  const signature = sigHeader.value;

  // Raw body
  const bodyBuffer = await readRawBody(req);
  // Diagnostics (safe)
  try {
    console.log('Webhook body diagnostics', {
      contentLength: req.headers['content-length'],
      rawLen: bodyBuffer.length,
      contentType: req.headers['content-type'],
      sigLen: signature.length,
    });
  } catch {}

  if (!verifySignature(bodyBuffer, signature)) {
    if (appEnv.DEBUG_SIGNATURE === 'true') {
      try {
        console.warn('Invalid webhook signature (diagnostics)', {
          headerUsed: sigHeader.name,
          sigLen: signature.length,
          startsWithSha256: signature.startsWith('sha256='),
          contentType: req.headers['content-type'],
        });
      } catch {}
    }
    console.warn('Invalid webhook signature', { hasSignature: true, ua: req.headers['user-agent'] });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Operation header (accept update/create, missing -> proceed)
  const operation = getHeader(req, ['sanity-operation', 'x-sanity-operation', 'x-sanity-event']);
  const op = operation?.toLowerCase();
  if (op && op !== 'update' && op !== 'create') {
    console.log('Webhook ignored - unsupported operation', { op });
    return res.json({ message: 'Webhook ignored - unsupported operation', operation: op });
  }
  if (!op) {
    console.log('Webhook proceeding - missing operation header');
  }

  // Parse payload strictly from raw body
  const rawPayload = JSON.parse(bodyBuffer.toString('utf8'));
  const payload = SanityWebhookPayloadSchema.parse(rawPayload);
  console.log('Webhook received', { documentId: payload._id, type: payload._type });

  // Smart conditions
  const check = await shouldTriggerTranslation(payload._id);
  console.log('Smart translation check', check);
  if (!check.shouldTrigger) {
    return res.json({ message: 'Smart trigger conditions not met', reason: check });
  }

  // Dispatch GitHub repository_dispatch
  const dispatchPayload = GitHubDispatchPayloadSchema.parse({
    event_type: 'sanity_article_ja',
    client_payload: {
      documentId: payload._id,
      title: payload.title,
      triggeredBy: 'smart-webhook',
      timestamp: new Date().toISOString(),
      hasImages: check.hasImages,
      translationStatus: check.translationStatus,
    },
  });

  await octokit.repos.createDispatchEvent({
    owner: appEnv!.GITHUB_OWNER,
    repo: appEnv!.GITHUB_REPO,
    event_type: dispatchPayload.event_type,
    client_payload: dispatchPayload.client_payload as { [key: string]: unknown },
  });

  console.log('GitHub workflow dispatched', {
    documentId: payload._id,
    owner: appEnv!.GITHUB_OWNER,
    repo: appEnv!.GITHUB_REPO,
  });

  return res.json({
    message: 'Translation workflow triggered',
    documentId: payload._id,
    timestamp: new Date().toISOString(),
  });
}
