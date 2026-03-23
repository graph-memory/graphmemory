/**
 * Tests for lazy model loading, ONNX session options, and dispose.
 *
 * Uses mocked @huggingface/transformers to avoid loading real ONNX models.
 */

import { loadModel, embed, embedQuery, embedBatch, resetEmbedder, disposeModel, disposeAllModels } from '@/lib/embedder';
import type { ModelConfig, EmbeddingConfig } from '@/lib/multi-config';

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers
// ---------------------------------------------------------------------------

const mockPipeCall = jest.fn().mockImplementation((_text: unknown, _opts: unknown) => {
  return Promise.resolve({
    data: new Float32Array(32),
    dims: [1, 32],
  });
});
const mockDispose = jest.fn().mockResolvedValue(undefined);
const mockPipeline = jest.fn().mockImplementation(() => {
  return Promise.resolve({
    _call: mockPipeCall,
    dispose: mockDispose,
  });
});

jest.mock('@huggingface/transformers', () => ({
  pipeline: (...args: unknown[]) => mockPipeline(...args),
  env: { cacheDir: '', allowRemoteModels: false },
}));

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true), // pretend model dir exists locally
  };
});

// ---------------------------------------------------------------------------

const MODEL: ModelConfig = {
  name: 'test/model',
  pooling: 'cls',
  normalize: true,
  dtype: 'q8',
  queryPrefix: '',
  documentPrefix: '',
};

const EMBEDDING: EmbeddingConfig = {
  batchSize: 1,
  maxChars: 24000,
  cacheSize: 100,
};

const MODELS_DIR = '/tmp/models';

beforeEach(() => {
  resetEmbedder();
  mockPipeline.mockClear();
  mockPipeCall.mockClear();
  mockDispose.mockClear();
});

describe('lazy loading', () => {
  it('loadModel does NOT create pipeline immediately', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'test');
    expect(mockPipeline).not.toHaveBeenCalled();
  });

  it('first embed() triggers pipeline creation', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'test');
    expect(mockPipeline).not.toHaveBeenCalled();

    await embed('title', 'content', 'test');
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('subsequent embed() reuses pipeline', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'test');
    await embed('title1', 'content1', 'test');
    await embed('title2', 'content2', 'test');
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('embedQuery() also triggers lazy load', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'test');
    await embedQuery('search query', 'test');
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('embedBatch() triggers lazy load', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'test');
    await embedBatch([
      { title: 'a', content: 'b' },
      { title: 'c', content: 'd' },
    ], 'test');
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });

  it('two models with same name+dtype share one pipeline', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'model-a');
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'model-b');

    await embed('title', 'content', 'model-a');
    expect(mockPipeline).toHaveBeenCalledTimes(1);

    await embed('title', 'content', 'model-b');
    // Should reuse the cached pipeline, not create a new one
    expect(mockPipeline).toHaveBeenCalledTimes(1);
  });
});

describe('ONNX session options', () => {
  it('passes session_options to pipeline()', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'test');
    await embed('title', 'content', 'test');

    expect(mockPipeline).toHaveBeenCalledWith(
      'feature-extraction',
      'test/model',
      expect.objectContaining({
        session_options: expect.objectContaining({
          enableCpuMemArena: false,
          enableMemPattern: false,
          executionMode: 'sequential',
        }),
      }),
    );
  });
});

describe('dispose', () => {
  it('disposeModel calls pipe.dispose() when no other entries share it', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'test');
    await embed('title', 'content', 'test'); // trigger lazy load
    expect(mockPipeline).toHaveBeenCalledTimes(1);

    await disposeModel('test');
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it('disposeModel does NOT dispose shared pipeline', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'model-a');
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'model-b');

    await embed('title', 'content', 'model-a'); // load pipeline
    await embed('title', 'content', 'model-b'); // reuse pipeline

    await disposeModel('model-a');
    // Pipeline still used by model-b — should NOT be disposed
    expect(mockDispose).not.toHaveBeenCalled();

    // model-b should still work
    await embed('another', 'text', 'model-b');
    expect(mockPipeCall).toHaveBeenCalled();
  });

  it('disposeModel is no-op for unknown model', async () => {
    await disposeModel('nonexistent'); // should not throw
  });

  it('disposeAllModels disposes all unique pipelines', async () => {
    // Two different models (different names → different pipelines)
    const model2: ModelConfig = { ...MODEL, name: 'test/model2' };
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'model-a');
    await loadModel(model2, EMBEDDING, MODELS_DIR, 'model-b');

    await embed('title', 'content', 'model-a');
    await embed('title', 'content', 'model-b');
    expect(mockPipeline).toHaveBeenCalledTimes(2);

    await disposeAllModels();
    expect(mockDispose).toHaveBeenCalledTimes(2);
  });

  it('disposeModel for model without loaded pipeline is safe', async () => {
    await loadModel(MODEL, EMBEDDING, MODELS_DIR, 'test');
    // Don't trigger lazy load — pipe is null
    await disposeModel('test');
    expect(mockDispose).not.toHaveBeenCalled();
  });
});
