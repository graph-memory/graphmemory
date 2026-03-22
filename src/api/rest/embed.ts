import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { embedBatch } from '@/lib/embedder';
import { float32ToBase64 } from '@/lib/embedding-codec';
import type { EmbeddingApiConfig } from '@/lib/multi-config';

/**
 * Create an Express router for the embedding API.
 * POST /api/embed — embed texts using the server's embedding model.
 */
export function createEmbedRouter(apiConfig: EmbeddingApiConfig, modelName: string): Router {
  const router = Router();

  const embedRequestSchema = z.object({
    texts: z.array(z.string().max(apiConfig.maxTextChars)).min(1).max(apiConfig.maxTexts),
    format: z.enum(['json', 'base64']).optional().default('json'),
  });

  router.post('/', async (req, res, next) => {
    try {
      // Auth: check embeddingApi.apiKey (separate from user apiKey)
      if (apiConfig.apiKey) {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Invalid embedding API key' });
        }
        const provided = Buffer.from(auth.slice(7));
        const expected = Buffer.from(apiConfig.apiKey);
        if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
          return res.status(401).json({ error: 'Invalid embedding API key' });
        }
      }

      const parsed = embedRequestSchema.parse(req.body);
      const inputs = parsed.texts.map(text => ({ title: text, content: '' }));
      const embeddings = await embedBatch(inputs, modelName);

      if (parsed.format === 'base64') {
        res.json({ embeddings: embeddings.map(e => float32ToBase64(e)), format: 'base64' });
      } else {
        res.json({ embeddings });
      }
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error' });
      }
      next(err);
    }
  });

  return router;
}
