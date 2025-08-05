// Vercel serverless function entry point
import type { VercelRequest, VercelResponse } from '@vercel/node';
import WebhookServer from '../src/server.js';

let server: WebhookServer;

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (!server) {
    server = new WebhookServer();
  }
  
  return server.getApp()(req, res);
}