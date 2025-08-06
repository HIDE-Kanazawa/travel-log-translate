// Vercel serverless function entry point
import type { VercelRequest, VercelResponse } from '@vercel/node';

let server: any;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!server) {
      // Dynamic import to handle ES modules in Vercel runtime
      const WebhookServerModule = await import('../dist/server.js');
      const WebhookServer = WebhookServerModule.default;
      server = new WebhookServer();
    }
    
    return server.getApp()(req, res);
  } catch (error) {
    console.error('Vercel handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : undefined) : undefined
    });
  }
}