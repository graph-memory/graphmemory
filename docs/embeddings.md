# Embedding System

**File**: `src/lib/embedder.ts`

The embedding system converts text into high-dimensional vectors for semantic search. Supports local ONNX models via `@huggingface/transformers` and remote HTTP proxies.

## Default model

**Xenova/bge-m3** — the default embedding model:
- 1024 dimensions
- Multilingual (100+ languages)
- 8K token context
- ~560 MB download size
- Pooling: `cls`
- Normalization: L2-normalized (cosine similarity = dot product)

## Model registry

Two-level cache with deduplication:

```
_pipes: Map<name, Pipeline>        — named models (e.g. "my-app:docs", "my-app:code")
_modelCache: Map<modelString, Pipeline> — deduplicates by model config string
```

The same physical model is loaded only once in memory, even if used by multiple graphs or projects.

## Functions

| Function | Description |
|----------|-------------|
| `loadModel(model, modelsDir, maxChars, name)` | Load model from local cache or download from HuggingFace |
| `embed(title, content, modelName?)` | Single embedding: `"title\ncontent"` → `number[]` |
| `embedBatch(inputs, modelName?)` | Batch embedding: multiple items in one forward pass |
| `cosineSimilarity(a, b)` | Dot product (vectors are L2-normalized) |

## Embedding resolution

Embedding config can be set at three levels with first-defined-wins (whole object, no field merge):

```
graph.embedding → project.embedding → server.embedding → defaults
```

If a graph defines its own `embedding` block, it is used completely. Otherwise the project-level is used, falling back to server-level.

## Configuration options

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | string | `Xenova/bge-m3` | HuggingFace model ID |
| `pooling` | string | `cls` | Pooling strategy: `mean` or `cls` |
| `normalize` | boolean | `true` | L2-normalize output vectors |
| `dtype` | string | — | Quantization: `fp32`, `fp16`, `q8`, `q4` |
| `queryPrefix` | string | `""` | Prefix prepended to search queries |
| `documentPrefix` | string | `""` | Prefix prepended to documents during indexing |
| `batchSize` | number | `1` | Texts per ONNX forward pass |
| `remote` | string | — | Remote embedding API URL |
| `remoteApiKey` | string | — | API key for remote endpoint |

## Model examples

### BGE-M3 (default, recommended)

```yaml
embedding:
  model: "Xenova/bge-m3"
  pooling: "cls"
  normalize: true
```

### BGE-base (English, smaller)

```yaml
embedding:
  model: "Xenova/bge-base-en-v1.5"
  pooling: "cls"
  normalize: true
  queryPrefix: "Represent this sentence for searching relevant passages: "
```

### BGE-small (English, smallest)

```yaml
embedding:
  model: "Xenova/bge-small-en-v1.5"
  pooling: "cls"
  normalize: true
  queryPrefix: "Represent this sentence for searching relevant passages: "
```

### all-MiniLM-L6-v2 (legacy)

```yaml
embedding:
  model: "Xenova/all-MiniLM-L6-v2"
  pooling: "mean"
  normalize: true
```

### nomic-embed-text-v1.5

```yaml
embedding:
  model: "nomic-ai/nomic-embed-text-v1.5"
  pooling: "mean"
  normalize: true
  queryPrefix: "search_query: "
  documentPrefix: "search_document: "
```

### Quantized model (lower memory)

```yaml
embedding:
  model: "Xenova/bge-m3"
  pooling: "cls"
  normalize: true
  dtype: "q8"      # fp32, fp16, q8, q4
```

## Remote embedding

Instead of loading a local ONNX model, a project can delegate embedding to a remote server:

```yaml
server:
  embedding:
    remote: "http://gpu-server:3000/api/embed"
    remoteApiKey: "emb-secret-key"
```

When `remote` is set:
- `loadModel()` registers an HTTP proxy instead of downloading an ONNX model
- `embed()` and `embedBatch()` forward requests to the remote endpoint via HTTP POST
- URL validation enforces `http:` or `https:` protocols only (SSRF protection)

This is useful for delegating embedding to a GPU machine running the Embedding API endpoint (see below).

## Embedding API

The server can expose its local embedding model as a REST endpoint:

```yaml
server:
  embeddingApi:
    enabled: true
    apiKey: "emb-secret-key"     # optional, separate from user apiKeys
```

### Endpoint

`POST /api/embed`

```json
// Request
{ "texts": ["hello world", "another text"] }

// Response
{ "embeddings": [[0.1, 0.2, ...], [0.3, 0.4, ...]] }
```

Validation: max 100 texts, max 10,000 chars each.

When `apiKey` is set, requests must include `Authorization: Bearer <apiKey>`. The embedding API key is separate from user authentication keys.

## Mixed models per graph

Different graphs can use different embedding models:

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    embedding:
      model: "Xenova/bge-m3"         # default for most graphs
    graphs:
      files:
        embedding:
          model: "Xenova/bge-small-en-v1.5"  # smaller model for file paths
      code:
        embedding:
          model: "Xenova/bge-base-en-v1.5"   # different model for code
```

## Automatic re-index on model change

Each persisted graph JSON stores an embedding fingerprint (model + pooling + normalize + documentPrefix + dtype). On load, if the fingerprint doesn't match the current config, the graph is automatically discarded and re-indexed from scratch.

## Model cache

Models are cached locally at `~/.graph-memory/models/` (configurable via `server.modelsDir`). First startup downloads the model; subsequent starts use the cache.

For Docker, mount a named volume to `/data/models/` to persist the cache across container restarts.
