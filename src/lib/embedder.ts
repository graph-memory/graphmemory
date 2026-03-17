import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';
import fs from 'fs';
import path from 'path';
import type { EmbeddingConfig } from '@/lib/multi-config';

interface ModelEntry {
  pipe: FeatureExtractionPipeline;
  config: EmbeddingConfig;
}

const _models = new Map<string, ModelEntry>();                     // name → { pipe, config }
const _pipeCache = new Map<string, FeatureExtractionPipeline>();   // "model|dtype" → pipe (dedup)
let _maxChars = 4000;

export async function loadModel(
  config: EmbeddingConfig, modelsDir: string, maxChars: number, name = 'default',
): Promise<void> {
  _maxChars = maxChars;

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

function getEntry(modelName: string): ModelEntry {
  const entry = _models.get(modelName);
  if (!entry) throw new Error(`Model "${modelName}" not loaded. Call loadModel() first.`);
  return entry;
}

/** Embed a document (indexing). Applies documentPrefix and configured pooling. */
export async function embed(title: string, content: string, modelName = 'default'): Promise<number[]> {
  const { pipe, config } = getEntry(modelName);
  const raw = `${title}\n${content}`;
  const text = `${config.documentPrefix}${raw}`.slice(0, _maxChars);
  const tensor = await pipe._call(text, { pooling: config.pooling, normalize: config.normalize });
  return Array.from(tensor.data as Float32Array);
}

/** Embed a search query. Applies queryPrefix and configured pooling. */
export async function embedQuery(query: string, modelName = 'default'): Promise<number[]> {
  const { pipe, config } = getEntry(modelName);
  const text = `${config.queryPrefix}${query}`.slice(0, _maxChars);
  const tensor = await pipe._call(text, { pooling: config.pooling, normalize: config.normalize });
  return Array.from(tensor.data as Float32Array);
}

/** Batch-embed documents (indexing). Applies documentPrefix and configured pooling. */
export async function embedBatch(
  inputs: Array<{ title: string; content: string }>, modelName = 'default',
): Promise<number[][]> {
  const { pipe, config } = getEntry(modelName);
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [await embed(inputs[0].title, inputs[0].content, modelName)];

  const texts = inputs.map(({ title, content }) =>
    `${config.documentPrefix}${title}\n${content}`.slice(0, _maxChars),
  );
  const tensor = await pipe._call(texts, { pooling: config.pooling, normalize: config.normalize });
  const dim = tensor.dims[1];
  const data = tensor.data as Float32Array;
  const result: number[][] = [];
  for (let i = 0; i < inputs.length; i++) {
    result.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
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
