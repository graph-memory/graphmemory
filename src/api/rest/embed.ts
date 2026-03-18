import { Router } from 'express';
import { z } from 'zod';
import { embed } from '@/lib/embedder';
import type { EmbeddingApiConfig } from '@/lib/multi-config';

const embedRequestSchema = z.object({
  texts: z.array(z.string().max(10_000)).min(1).max(100),
});

/**
 * Create an Express router for the embedding API.
 * POST /api/embed — embed texts using the server's embedding model.
 */
export function createEmbedRouter(apiConfig: EmbeddingApiConfig, modelName: string): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      // Auth: check embeddingApi.apiKey (separate from user apiKey)
      if (apiConfig.apiKey) {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ') || auth.slice(7) !== apiConfig.apiKey) {
          return res.status(401).json({ error: 'Invalid embedding API key' });
        }
      }

      const parsed = embedRequestSchema.parse(req.body);
      const embeddings: number[][] = [];
      for (const text of parsed.texts) {
        const vec = await embed(text, '', modelName);
        embeddings.push(vec);
      }

      res.json({ embeddings });
    } catch (err: any) {
      if (err?.name === 'ZodError') {
        return res.status(400).json({ error: 'Validation error', details: err.issues });
      }
      next(err);
    }
  });

  return router;
}
