import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import type { EmbeddingConfig } from '@/lib/multi-config';

interface ModelEntry {
  pipe: FeatureExtractionPipeline | null;  // null for remote models
  config: EmbeddingConfig;
  remote?: { url: string; apiKey?: string };
}

const _models = new Map<string, ModelEntry>();                     // name → { pipe, config }
const _pipeCache = new Map<string, FeatureExtractionPipeline>();   // "model|dtype" → pipe (dedup)
let _maxChars = 4000;

export async function loadModel(
  config: EmbeddingConfig, modelsDir: string, maxChars: number, name = 'default',
): Promise<void> {
  _maxChars = maxChars;

  // Remote embedding: register proxy, skip ONNX loading
  if (config.remote) {
    _models.set(name, { pipe: null, config, remote: { url: config.remote, apiKey: config.remoteApiKey } });
    process.stderr.write(`[embedder] Model "${name}" using remote endpoint ${config.remote}\n`);
    return;
  }

  // Cache key includes dtype since same model with different dtype = different pipeline
  const cacheKey = `${config.model}|${config.dtype ?? ''}`;

  // Reuse pipeline if same model+dtype already loaded
  const cached = _pipeCache.get(cacheKey);
  if (cached) {
    _models.set(name, { pipe: cached, config });
    process.stderr.write(`[embedder] Reusing model ${config.model} for "${name}"\n`);
    return;
  }

  env.cacheDir = modelsDir;
  const modelDir = path.join(modelsDir, config.model.replace('/', path.sep));
  if (fs.existsSync(modelDir)) {
    env.allowRemoteModels = false;
    process.stderr.write(`[embedder] Using local model at ${modelDir}\n`);
  } else {
    env.allowRemoteModels = true;
    process.stderr.write(`[embedder] Downloading model ${config.model} to ${modelsDir}...\n`);
  }

  const pipeOpts: Record<string, unknown> = {};
  if (config.dtype) pipeOpts.dtype = config.dtype;

  const pipe = await pipeline('feature-extraction', config.model, pipeOpts);
  _pipeCache.set(cacheKey, pipe);
  _models.set(name, { pipe, config });
  process.stderr.write(`[embedder] Model "${name}" ready\n`);
}

// ---------------------------------------------------------------------------
// Remote embedding HTTP client
// ---------------------------------------------------------------------------

async function remoteEmbed(url: string, texts: string[], apiKey?: string): Promise<number[][]> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ texts }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Remote embed failed (${resp.status}): ${body}`);
  }
  const data = await resp.json() as { embeddings: number[][] };
  return data.embeddings;
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
  const text = `${entry.config.documentPrefix}${raw}`.slice(0, _maxChars);

  if (entry.remote) {
    const [vec] = await remoteEmbed(entry.remote.url, [text], entry.remote.apiKey);
    return vec;
  }

  const tensor = await entry.pipe!._call(text, { pooling: entry.config.pooling, normalize: entry.config.normalize });
  return Array.from(tensor.data as Float32Array);
}

/** Embed a search query. Applies queryPrefix and configured pooling. */
export async function embedQuery(query: string, modelName = 'default'): Promise<number[]> {
  const entry = getEntry(modelName);
  const text = `${entry.config.queryPrefix}${query}`.slice(0, _maxChars);

  if (entry.remote) {
    const [vec] = await remoteEmbed(entry.remote.url, [text], entry.remote.apiKey);
    return vec;
  }

  const tensor = await entry.pipe!._call(text, { pooling: entry.config.pooling, normalize: entry.config.normalize });
  return Array.from(tensor.data as Float32Array);
}

/** Batch-embed documents (indexing). Applies documentPrefix and configured pooling. */
export async function embedBatch(
  inputs: Array<{ title: string; content: string }>, modelName = 'default',
): Promise<number[][]> {
  const entry = getEntry(modelName);
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [await embed(inputs[0].title, inputs[0].content, modelName)];

  const texts = inputs.map(({ title, content }) =>
    `${entry.config.documentPrefix}${title}\n${content}`.slice(0, _maxChars),
  );

  if (entry.remote) {
    return remoteEmbed(entry.remote.url, texts, entry.remote.apiKey);
  }

  const batchSize = entry.config.batchSize;
  const result: number[][] = [];
  for (let start = 0; start < texts.length; start += batchSize) {
    const chunk = texts.slice(start, start + batchSize);
    const tensor = await entry.pipe!._call(chunk, { pooling: entry.config.pooling, normalize: entry.config.normalize });
    const dim = tensor.dims[1];
    const data = tensor.data as Float32Array;
    for (let i = 0; i < chunk.length; i++) {
      result.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
    }
  }
  return result;
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
