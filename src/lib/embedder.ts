import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import type { ModelConfig, EmbeddingConfig } from '@/lib/multi-config';
import { DEFAULT_EMBEDDING_CACHE_SIZE, REMOTE_MAX_RETRIES, REMOTE_BASE_DELAY_MS, ERROR_BODY_LIMIT } from '@/lib/defaults';

// ---------------------------------------------------------------------------
// LRU cache for embedding vectors (avoids re-computing identical texts)
// ---------------------------------------------------------------------------

const DEFAULT_CACHE_SIZE = DEFAULT_EMBEDDING_CACHE_SIZE;

class LruCache<V> {
  private map = new Map<string, V>();
  constructor(private maxSize: number) {}

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      // Evict oldest (first key)
      const first = this.map.keys().next().value!;
      this.map.delete(first);
    }
  }

  clear(): void { this.map.clear(); }
}

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

interface ModelEntry {
  pipe: FeatureExtractionPipeline | null;  // null for remote models
  model: ModelConfig;
  embedding: EmbeddingConfig;
  maxChars: number;
  cache: LruCache<number[]>;
  remote?: { url: string; apiKey?: string; model?: string };
}

const _models = new Map<string, ModelEntry>();                     // name → { pipe, model, embedding }
const _pipeCache = new Map<string, FeatureExtractionPipeline>();   // "model|dtype" → pipe (dedup)

function validateRemoteUrl(url: string): void {
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error(`Invalid remote embedding URL: ${url}`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Remote embedding URL must use http or https: ${url}`);
  }
}

export async function loadModel(
  model: ModelConfig, embedding: EmbeddingConfig, modelsDir: string, name = 'default',
): Promise<void> {
  const maxChars = embedding.maxChars;
  const cacheSize = embedding.cacheSize ?? DEFAULT_CACHE_SIZE;

  // Remote embedding: register proxy, skip ONNX loading
  if (embedding.remote) {
    validateRemoteUrl(embedding.remote);
    _models.set(name, { pipe: null, model, embedding, maxChars, cache: new LruCache(cacheSize), remote: { url: embedding.remote, apiKey: embedding.remoteApiKey, model: embedding.remoteModel } });
    process.stderr.write(`[embedder] Model "${name}" using remote endpoint ${embedding.remote}\n`);
    return;
  }

  // Cache key includes dtype since same model with different dtype = different pipeline
  const cacheKey = `${model.name}|${model.dtype ?? ''}`;

  // Reuse pipeline if same model+dtype already loaded
  const cached = _pipeCache.get(cacheKey);
  if (cached) {
    _models.set(name, { pipe: cached, model, embedding, maxChars, cache: new LruCache(cacheSize) });
    process.stderr.write(`[embedder] Reusing model ${model.name} for "${name}"\n`);
    return;
  }

  env.cacheDir = modelsDir;
  const modelDir = path.join(modelsDir, model.name.replace('/', path.sep));
  if (fs.existsSync(modelDir)) {
    env.allowRemoteModels = false;
    process.stderr.write(`[embedder] Using local model at ${modelDir}\n`);
  } else {
    env.allowRemoteModels = true;
    process.stderr.write(`[embedder] Downloading model ${model.name} to ${modelsDir}...\n`);
  }

  const pipeOpts: Record<string, unknown> = {};
  if (model.dtype) pipeOpts.dtype = model.dtype;

  const pipe = await pipeline('feature-extraction', model.name, pipeOpts);
  _pipeCache.set(cacheKey, pipe);
  _models.set(name, { pipe, model, embedding, maxChars, cache: new LruCache(cacheSize) });
  process.stderr.write(`[embedder] Model "${name}" ready\n`);
}

// ---------------------------------------------------------------------------
// Remote embedding HTTP client
// ---------------------------------------------------------------------------


async function remoteEmbed(url: string, texts: string[], apiKey?: string, remoteModel?: string): Promise<number[][]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const payload: Record<string, unknown> = { texts };
  if (remoteModel) payload.model = remoteModel;
  const body = JSON.stringify(payload);

  for (let attempt = 0; attempt < REMOTE_MAX_RETRIES; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, { method: 'POST', headers, body });
    } catch (err) {
      // Network error — retry
      if (attempt < REMOTE_MAX_RETRIES - 1) {
        const delay = REMOTE_BASE_DELAY_MS * 2 ** attempt;
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw new Error(`Remote embed network error after ${REMOTE_MAX_RETRIES} attempts: ${err}`);
    }

    if (resp.ok) {
      const data = await resp.json() as { embeddings: number[][] };
      return data.embeddings;
    }

    // Client errors (4xx) — don't retry
    if (resp.status < 500) {
      const respBody = (await resp.text()).slice(0, ERROR_BODY_LIMIT);
      throw new Error(`Remote embed failed (${resp.status}): ${respBody}`);
    }

    // Server errors (5xx) — retry
    if (attempt < REMOTE_MAX_RETRIES - 1) {
      const delay = REMOTE_BASE_DELAY_MS * 2 ** attempt;
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    const respBody = (await resp.text()).slice(0, ERROR_BODY_LIMIT);
    throw new Error(`Remote embed failed after ${REMOTE_MAX_RETRIES} attempts (${resp.status}): ${respBody}`);
  }

  throw new Error('Remote embed: unreachable');
}

function getEntry(modelName: string): ModelEntry {
  const entry = _models.get(modelName);
  if (!entry) throw new Error(`Model "${modelName}" not loaded. Call loadModel() first.`);
  return entry;
}

/** Embed a document (indexing). Applies documentPrefix and configured pooling. */
export async function embed(title: string, content: string, modelName = 'default'): Promise<number[]> {
  const entry = getEntry(modelName);
  const raw = `${title}\n${content}`;
  const text = `${entry.model.documentPrefix}${raw}`.slice(0, entry.maxChars);

  const cached = entry.cache.get(text);
  if (cached) return cached;

  let vec: number[];
  if (entry.remote) {
    [vec] = await remoteEmbed(entry.remote.url, [text], entry.remote.apiKey, entry.remote.model);
  } else {
    const tensor = await entry.pipe!._call(text, { pooling: entry.model.pooling, normalize: entry.model.normalize });
    vec = Array.from(tensor.data as Float32Array);
  }
  entry.cache.set(text, vec);
  return vec;
}

/** Embed a search query. Applies queryPrefix and configured pooling. */
export async function embedQuery(query: string, modelName = 'default'): Promise<number[]> {
  const entry = getEntry(modelName);
  const text = `${entry.model.queryPrefix}${query}`.slice(0, entry.maxChars);

  const cached = entry.cache.get(text);
  if (cached) return cached;

  let vec: number[];
  if (entry.remote) {
    [vec] = await remoteEmbed(entry.remote.url, [text], entry.remote.apiKey, entry.remote.model);
  } else {
    const tensor = await entry.pipe!._call(text, { pooling: entry.model.pooling, normalize: entry.model.normalize });
    vec = Array.from(tensor.data as Float32Array);
  }
  entry.cache.set(text, vec);
  return vec;
}

/** Batch-embed documents (indexing). Applies documentPrefix and configured pooling. */
export async function embedBatch(
  inputs: Array<{ title: string; content: string }>, modelName = 'default',
): Promise<number[][]> {
  const entry = getEntry(modelName);
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [await embed(inputs[0].title, inputs[0].content, modelName)];

  const texts = inputs.map(({ title, content }) =>
    `${entry.model.documentPrefix}${title}\n${content}`.slice(0, entry.maxChars),
  );

  // Check cache: split into hits and misses
  const result: (number[] | null)[] = texts.map(t => entry.cache.get(t) ?? null);
  const missIndices = result.map((v, i) => v === null ? i : -1).filter(i => i >= 0);

  if (missIndices.length === 0) return result as number[][];

  const missTexts = missIndices.map(i => texts[i]);
  let missVecs: number[][];

  if (entry.remote) {
    missVecs = await remoteEmbed(entry.remote.url, missTexts, entry.remote.apiKey, entry.remote.model);
  } else {
    missVecs = [];
    const batchSize = entry.embedding.batchSize;
    for (let start = 0; start < missTexts.length; start += batchSize) {
      const chunk = missTexts.slice(start, start + batchSize);
      const tensor = await entry.pipe!._call(chunk, { pooling: entry.model.pooling, normalize: entry.model.normalize });
      const dim = tensor.dims[1];
      const data = tensor.data as Float32Array;
      for (let i = 0; i < chunk.length; i++) {
        missVecs.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
      }
    }
  }

  // Fill results and populate cache
  for (let j = 0; j < missIndices.length; j++) {
    const idx = missIndices[j];
    result[idx] = missVecs[j];
    entry.cache.set(texts[idx], missVecs[j]);
  }

  return result as number[][];
}

export function resetEmbedder(): void {
  _models.clear();
  _pipeCache.clear();
}

// Vectors are L2-normalized → dot product = cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
