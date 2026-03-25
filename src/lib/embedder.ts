import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { ModelConfig, EmbeddingConfig } from '@/lib/multi-config';
import { DEFAULT_EMBEDDING_CACHE_SIZE, REMOTE_MAX_RETRIES, REMOTE_BASE_DELAY_MS, ERROR_BODY_LIMIT } from '@/lib/defaults';
import { float32ToBase64, base64ToFloat32 } from '@/lib/embedding-codec';
import type { RedisClientType } from 'redis';

// ---------------------------------------------------------------------------
// Embedding cache abstraction
// ---------------------------------------------------------------------------

export interface EmbeddingCache {
  get(text: string): Promise<number[] | undefined>;
  set(text: string, vector: number[]): Promise<void>;
  clear(): Promise<void>;
}

// ---------------------------------------------------------------------------
// LRU cache (in-memory) — default implementation
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

export class MemoryEmbeddingCache implements EmbeddingCache {
  private lru: LruCache<number[]>;
  constructor(maxSize: number) { this.lru = new LruCache(maxSize); }
  async get(text: string): Promise<number[] | undefined> { return this.lru.get(text); }
  async set(text: string, vector: number[]): Promise<void> { this.lru.set(text, vector); }
  async clear(): Promise<void> { this.lru.clear(); }
}

export class RedisEmbeddingCache implements EmbeddingCache {
  constructor(
    private client: RedisClientType,
    private prefix: string,
    private ttlSeconds: number,  // 0 = no TTL
  ) {}

  private hashKey(text: string): string {
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    return `${this.prefix}emb:${hash}`;
  }

  async get(text: string): Promise<number[] | undefined> {
    const raw = await this.client.get(this.hashKey(text));
    if (!raw) return undefined;
    return base64ToFloat32(raw);
  }

  async set(text: string, vector: number[]): Promise<void> {
    const key = this.hashKey(text);
    const value = float32ToBase64(vector);
    if (this.ttlSeconds > 0) {
      await this.client.set(key, value, { EX: this.ttlSeconds });
    } else {
      await this.client.set(key, value);
    }
  }

  async clear(): Promise<void> {
    // Clear by pattern — expensive, but only used in dispose/reset
    const pattern = `${this.prefix}emb:*`;
    for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      await this.client.del(key);
    }
  }
}

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

interface ModelEntry {
  pipe: FeatureExtractionPipeline | null;  // null for remote & lazy models
  pipePromise: Promise<FeatureExtractionPipeline> | null; // lazy init in-flight
  model: ModelConfig;
  embedding: EmbeddingConfig;
  modelsDir: string;
  maxChars: number;
  cache: EmbeddingCache;
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

/**
 * Register a model for lazy loading. The ONNX pipeline is NOT created here —
 * it will be loaded on the first embed/embedQuery/embedBatch call.
 * Remote models are registered immediately (no ONNX needed).
 */
export async function loadModel(
  model: ModelConfig, embedding: EmbeddingConfig, modelsDir: string, name = 'default',
  cache?: EmbeddingCache,
): Promise<void> {
  const maxChars = embedding.maxChars;
  const cacheSize = embedding.cacheSize ?? DEFAULT_CACHE_SIZE;
  const embeddingCache = cache ?? new MemoryEmbeddingCache(cacheSize);

  // Remote embedding: register proxy, skip ONNX loading
  if (embedding.remote) {
    validateRemoteUrl(embedding.remote);
    _models.set(name, { pipe: null, pipePromise: null, model, embedding, modelsDir, maxChars, cache: embeddingCache, remote: { url: embedding.remote, apiKey: embedding.remoteApiKey, model: embedding.remoteModel } });
    process.stderr.write(`[embedder] Model "${name}" using remote endpoint ${embedding.remote}\n`);
    return;
  }

  // Register for lazy loading — pipeline created on first use
  _models.set(name, { pipe: null, pipePromise: null, model, embedding, modelsDir, maxChars, cache: embeddingCache });
  process.stderr.write(`[embedder] Registered model ${model.name} for "${name}" (lazy)\n`);
}

// ---------------------------------------------------------------------------
// Lazy pipeline initialization
// ---------------------------------------------------------------------------

/** ONNX session options to reduce memory footprint. */
const SESSION_OPTIONS = {
  enableCpuMemArena: false,
  enableMemPattern: false,
  executionMode: 'sequential' as const,
};

/**
 * Ensure the ONNX pipeline is loaded for a model entry.
 * Deduplicates by model+dtype via _pipeCache. Concurrent calls share the same promise.
 */
async function ensurePipeline(entry: ModelEntry): Promise<FeatureExtractionPipeline> {
  if (entry.pipe) return entry.pipe;
  if (entry.remote) throw new Error('ensurePipeline called on remote model');

  const cacheKey = `${entry.model.name}|${entry.model.dtype ?? ''}`;

  // Reuse pipeline if same model+dtype already loaded by another entry
  const cached = _pipeCache.get(cacheKey);
  if (cached) {
    entry.pipe = cached;
    entry.pipePromise = null;
    process.stderr.write(`[embedder] Reusing model ${entry.model.name} for lazy init\n`);
    return cached;
  }

  // Deduplicate concurrent lazy inits for same entry
  if (entry.pipePromise) return entry.pipePromise;

  entry.pipePromise = (async () => {
    env.cacheDir = entry.modelsDir;
    const modelDir = path.join(entry.modelsDir, entry.model.name.replace('/', path.sep));
    if (fs.existsSync(modelDir)) {
      env.allowRemoteModels = false;
      process.stderr.write(`[embedder] Loading local model ${entry.model.name}...\n`);
    } else {
      env.allowRemoteModels = true;
      process.stderr.write(`[embedder] Downloading model ${entry.model.name} to ${entry.modelsDir}...\n`);
    }

    const pipeOpts: Record<string, unknown> = { session_options: SESSION_OPTIONS };
    if (entry.model.dtype) pipeOpts.dtype = entry.model.dtype;

    const pipe = await pipeline('feature-extraction', entry.model.name, pipeOpts);
    _pipeCache.set(cacheKey, pipe);
    entry.pipe = pipe;
    entry.pipePromise = null;
    process.stderr.write(`[embedder] Model ${entry.model.name} ready\n`);
    return pipe;
  })();

  return entry.pipePromise;
}

// ---------------------------------------------------------------------------
// Dispose
// ---------------------------------------------------------------------------

/** Dispose a single model entry. Pipeline is only disposed if no other entries reference it. */
export async function disposeModel(name: string): Promise<void> {
  const entry = _models.get(name);
  if (!entry) return;

  if (entry.pipe) {
    // Check if any other entry shares this pipeline
    const cacheKey = `${entry.model.name}|${entry.model.dtype ?? ''}`;
    let shared = false;
    for (const [n, e] of _models) {
      if (n !== name && e.pipe === entry.pipe) { shared = true; break; }
    }
    if (!shared) {
      await entry.pipe.dispose();
      _pipeCache.delete(cacheKey);
      process.stderr.write(`[embedder] Disposed pipeline ${entry.model.name}\n`);
    }
  }

  await entry.cache.clear();
  _models.delete(name);
}

/** Dispose all pipelines and clear registries. */
export async function disposeAllModels(): Promise<void> {
  const disposed = new Set<FeatureExtractionPipeline>();
  for (const entry of _models.values()) {
    if (entry.pipe && !disposed.has(entry.pipe)) {
      disposed.add(entry.pipe);
      await entry.pipe.dispose();
    }
    await entry.cache.clear();
  }
  _models.clear();
  _pipeCache.clear();
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

  const cached = await entry.cache.get(text);
  if (cached) return cached;

  let vec: number[];
  if (entry.remote) {
    [vec] = await remoteEmbed(entry.remote.url, [text], entry.remote.apiKey, entry.remote.model);
  } else {
    const pipe = await ensurePipeline(entry);
    const tensor = await pipe._call(text, { pooling: entry.model.pooling, normalize: entry.model.normalize });
    vec = Array.from(tensor.data as Float32Array);
  }
  await entry.cache.set(text, vec);
  return vec;
}

/** Embed a search query. Applies queryPrefix and configured pooling. */
export async function embedQuery(query: string, modelName = 'default'): Promise<number[]> {
  const entry = getEntry(modelName);
  const text = `${entry.model.queryPrefix}${query}`.slice(0, entry.maxChars);

  const cached = await entry.cache.get(text);
  if (cached) return cached;

  let vec: number[];
  if (entry.remote) {
    [vec] = await remoteEmbed(entry.remote.url, [text], entry.remote.apiKey, entry.remote.model);
  } else {
    const pipe = await ensurePipeline(entry);
    const tensor = await pipe._call(text, { pooling: entry.model.pooling, normalize: entry.model.normalize });
    vec = Array.from(tensor.data as Float32Array);
  }
  await entry.cache.set(text, vec);
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
  const cachedResults = await Promise.all(texts.map(t => entry.cache.get(t)));
  const result: (number[] | null)[] = cachedResults.map(v => v ?? null);
  const missIndices = result.map((v, i) => v === null ? i : -1).filter(i => i >= 0);

  if (missIndices.length === 0) return result as number[][];

  const missTexts = missIndices.map(i => texts[i]);
  let missVecs: number[][];

  if (entry.remote) {
    missVecs = await remoteEmbed(entry.remote.url, missTexts, entry.remote.apiKey, entry.remote.model);
  } else {
    const pipe = await ensurePipeline(entry);
    missVecs = [];
    const batchSize = entry.embedding.batchSize;
    for (let start = 0; start < missTexts.length; start += batchSize) {
      const chunk = missTexts.slice(start, start + batchSize);
      const tensor = await pipe._call(chunk, { pooling: entry.model.pooling, normalize: entry.model.normalize });
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
    await entry.cache.set(texts[idx], missVecs[j]);
  }

  return result as number[][];
}

export async function resetEmbedder(): Promise<void> {
  for (const entry of _models.values()) await entry.cache.clear();
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
