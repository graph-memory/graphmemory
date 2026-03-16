import { pipeline, env, FeatureExtractionPipeline } from '@xenova/transformers';
import fs from 'fs';
import path from 'path';

const _pipes = new Map<string, FeatureExtractionPipeline>();      // name → pipe
const _modelCache = new Map<string, FeatureExtractionPipeline>(); // model string → pipe (dedup)
let _maxChars = 4000;

export async function loadModel(
  model: string, modelsDir: string, maxChars: number, name = 'default',
): Promise<void> {
  _maxChars = maxChars;

  // Reuse if same model string already loaded
  const cached = _modelCache.get(model);
  if (cached) {
    _pipes.set(name, cached);
    process.stderr.write(`[embedder] Reusing model ${model} for "${name}"\n`);
    return;
  }

  env.cacheDir = modelsDir;
  const modelDir = path.join(modelsDir, model.replace('/', path.sep));
  if (fs.existsSync(modelDir)) {
    env.allowRemoteModels = false;
    process.stderr.write(`[embedder] Using local model at ${modelDir}\n`);
  } else {
    env.allowRemoteModels = true;
    process.stderr.write(`[embedder] Downloading model ${model} to ${modelsDir}...\n`);
  }

  const pipe = await pipeline('feature-extraction', model);
  _modelCache.set(model, pipe);
  _pipes.set(name, pipe);
  process.stderr.write(`[embedder] Model "${name}" ready\n`);
}

export async function embed(title: string, content: string, modelName = 'default'): Promise<number[]> {
  const pipe = _pipes.get(modelName);
  if (!pipe) throw new Error(`Model "${modelName}" not loaded. Call loadModel() first.`);

  const text = `${title}\n${content}`.slice(0, _maxChars);
  const tensor = await pipe._call(text, { pooling: 'mean', normalize: true });
  return Array.from(tensor.data as Float32Array);
}

export async function embedBatch(
  inputs: Array<{ title: string; content: string }>, modelName = 'default',
): Promise<number[][]> {
  const pipe = _pipes.get(modelName);
  if (!pipe) throw new Error(`Model "${modelName}" not loaded. Call loadModel() first.`);
  if (inputs.length === 0) return [];
  if (inputs.length === 1) return [await embed(inputs[0].title, inputs[0].content, modelName)];

  const texts = inputs.map(({ title, content }) => `${title}\n${content}`.slice(0, _maxChars));
  const tensor = await pipe._call(texts, { pooling: 'mean', normalize: true });
  const dim = tensor.dims[1];
  const data = tensor.data as Float32Array;
  const result: number[][] = [];
  for (let i = 0; i < inputs.length; i++) {
    result.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
  }
  return result;
}

export function resetEmbedder(): void {
  _pipes.clear();
  _modelCache.clear();
}

// Vectors are L2-normalized → dot product = cosine similarity
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}
