// Vercel serverless function entry point
import type { VercelRequest, VercelResponse } from '@vercel/node';
import WebhookServer from '../dist/server.js';

let server: WebhookServer;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (!server) {
      server = new WebhookServer();
    }
    
    return server.getApp()(req, res);
  } catch (error) {
    console.error('Vercel handler error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}