# Embedding System

**File**: `src/lib/embedder.ts`

The embedding system converts text into high-dimensional vectors for semantic search. Supports local ONNX models via `@huggingface/transformers` and remote HTTP proxies.

## Default models

**Xenova/bge-m3** — the default embedding model (docs, knowledge, tasks, skills, files):
- 1024 dimensions
- Multilingual (100+ languages)
- 8K token context
- ~560 MB download size
- Pooling: `cls`
- Normalization: L2-normalized (cosine similarity = dot product)

**jinaai/jina-embeddings-v2-base-code** — the default code graph model:
- 768 dimensions
- Trained on code + natural language pairs
- 8K token context
- Pooling: `mean`
- Normalization: L2-normalized

The code graph uses a separate model inheritance chain (`codeModel`) so it can use a code-optimized model by default while other graphs use BGE-M3.

## Model registry

Two-level cache with deduplication and **lazy loading**:

```
_pipes: Map<name, Pipeline | ModelConfig>  — named models (e.g. "my-app:docs", "my-app:code")
_modelCache: Map<modelString, Pipeline>    — deduplicates by model config string
```

`loadModel()` only registers the model configuration in `_pipes` — it does **not** create the ONNX pipeline. The actual pipeline is created lazily on the first call to `embed()`, `embedBatch()`, or `embedQuery()` for that model. This reduces peak memory by deferring model loads until each model is actually needed.

The same physical model is loaded only once in memory, even if used by multiple graphs or projects.

### ONNX session options

When creating a pipeline, the following ONNX Runtime session options are applied to reduce memory footprint:

```typescript
session_options: {
  enableCpuMemArena: false,     // disable pre-allocated CPU memory arena
  enableMemPattern: false,      // disable memory pattern optimization
  executionMode: 'sequential',  // single-threaded execution
}
```

These options trade a small amount of throughput for significantly lower memory usage, which is important when multiple models may be loaded simultaneously.

## Functions

| Function | Description |
|----------|-------------|
| `loadModel(model, embedding, modelsDir, name)` | Register model config (lazy — pipeline created on first use) |
| `embed(title, content, modelName?)` | Single embedding: `"title\ncontent"` → `number[]` (triggers lazy load if needed) |
| `embedQuery(query, modelName?)` | Query embedding with `queryPrefix` prepended (triggers lazy load if needed) |
| `embedBatch(inputs, modelName?)` | Batch embedding: multiple items in one forward pass (triggers lazy load if needed) |
| `cosineSimilarity(a, b)` | Dot product (vectors are L2-normalized) |
| `disposeModel(name)` | Dispose a single named pipeline and free its resources |
| `disposeAllModels()` | Dispose all loaded pipelines and clear the model cache |

## Config structure

Configuration is split into two separate objects: **model** (what model to use) and **embedding** (how to use it).

### Model config

Taken as a **whole object** from the first level that defines it (no field-by-field merge):

```
graph.model → project.model     → server.model     → defaults        (all graphs except code)
graph.model → project.codeModel → server.codeModel  → code defaults   (code graph)
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `Xenova/bge-m3` | HuggingFace model ID |
| `pooling` | string | `cls` | Pooling strategy: `mean` or `cls` |
| `normalize` | boolean | `true` | L2-normalize output vectors |
| `dtype` | string | `q8` | Quantization: `fp32`, `fp16`, `q8`, `q4` |
| `queryPrefix` | string | `""` | Prefix prepended to search queries |
| `documentPrefix` | string | `""` | Prefix prepended to documents during indexing |

### Embedding config

Each field **individually inherits** up the chain (field-by-field merge):

```
graph.embedding → project.embedding → server.embedding → defaults
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `batchSize` | number | `1` | Texts per ONNX forward pass |
| `maxChars` | number | `24000` | Max characters fed to embedder per node |
| `cacheSize` | number | `10000` | Embedding cache size (0 = disabled) |
| `remote` | string | — | Remote embedding API URL |
| `remoteApiKey` | string | — | API key for remote endpoint |
| `remoteModel` | string | — | Which model to request: `"default"` or `"code"` (auto-set to `"code"` for code graph) |

## Model examples

### BGE-M3 (default, recommended)

```yaml
model:
  name: "Xenova/bge-m3"
  pooling: "cls"
  normalize: true
```

### BGE-base (English, smaller)

```yaml
model:
  name: "Xenova/bge-base-en-v1.5"
  pooling: "cls"
  normalize: true
  queryPrefix: "Represent this sentence for searching relevant passages: "
```

### BGE-small (English, smallest)

```yaml
model:
  name: "Xenova/bge-small-en-v1.5"
  pooling: "cls"
  normalize: true
  queryPrefix: "Represent this sentence for searching relevant passages: "
```

### all-MiniLM-L6-v2 (legacy)

```yaml
model:
  name: "Xenova/all-MiniLM-L6-v2"
  pooling: "mean"
  normalize: true
```

### nomic-embed-text-v1.5

```yaml
model:
  name: "nomic-ai/nomic-embed-text-v1.5"
  pooling: "mean"
  normalize: true
  queryPrefix: "search_query: "
  documentPrefix: "search_document: "
```

### Quantized model (lower memory)

```yaml
model:
  name: "Xenova/bge-m3"
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

The Embedding API also accepts `format: "base64"` in the POST body to return embeddings as Base64-encoded Float32 arrays instead of JSON number arrays.

## Embedding compression

**File**: `src/lib/embedding-codec.ts`

Embedding vectors are stored in graph JSON files using **Base64 encoding** for compact serialization. Float32 arrays are encoded as Base64 strings, saving ~3x space vs JSON number arrays.

- **Save**: `compressEmbeddings(exported)` converts `number[]` → Base64 string for fields `embedding` and `fileEmbedding`
- **Load**: `decompressEmbeddings(exported)` converts Base64 string → `number[]`
- **Backwards compatible**: detects old format (`number[]`) on load and passes it through unchanged

Buffer alignment is handled explicitly — an optimized `Buffer.from(base64, 'base64')` approach is used with aligned copy before constructing a `Float32Array` view.

## Embedding API

The server can expose its local embedding model as a REST endpoint:

```yaml
server:
  embeddingApi:
    enabled: true
    apiKey: "emb-secret-key"     # optional, separate from user apiKeys
    maxTexts: 100                # max texts per request (default 100)
    maxTextChars: 10000          # max chars per text (default 10000)
```

### Endpoint

`POST /api/embed`

```json
// Request (default model)
{ "texts": ["hello world", "another text"] }

// Request (code model)
{ "texts": ["function login() { ... }"], "model": "code" }

// Response
{ "embeddings": [[0.1, 0.2, ...], [0.3, 0.4, ...]] }
```

The `model` parameter selects which embedding model to use: `"default"` (general, BGE-M3) or `"code"` (code-optimized, jina-code). Both models are loaded when the embedding API is enabled.

### Embedding API configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable the `/api/embed` endpoint |
| `apiKey` | string | — | Optional API key (separate from user apiKeys) |
| `maxTexts` | number | `100` | Maximum number of texts per request |
| `maxTextChars` | number | `10000` | Maximum characters per individual text |

Validation enforces `maxTexts` and `maxTextChars` limits on every request.

When `apiKey` is set, requests must include `Authorization: Bearer <apiKey>`. The embedding API key is separate from user authentication keys.

## Max file size

Files larger than `maxFileSize` (default 1 MB / 1048576 bytes) are skipped during indexing. This prevents embedding excessively large files. The limit can be set at server, workspace, or project level:

```yaml
server:
  maxFileSize: 1048576        # 1 MB (default)

projects:
  my-app:
    maxFileSize: 2097152      # 2 MB override for this project
```

## Rate limiting

The server applies per-IP rate limits (requests per minute) to protect the embedding API and other endpoints:

```yaml
server:
  rateLimit:
    global: 600     # all endpoints (default 600/min)
    search: 120     # search endpoints (default 120/min)
    auth: 10        # login/token endpoints (default 10/min)
```

## Mixed models per graph

Different graphs can use different embedding models. Model config is taken as a whole object (first-defined-wins), so each graph that defines `model` gets it entirely:

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    model:
      name: "Xenova/bge-m3"               # default for most graphs
      pooling: "cls"
      normalize: true
    graphs:
      files:
        model:
          name: "Xenova/bge-small-en-v1.5" # smaller model for file paths
          pooling: "cls"
          normalize: true
      code:
        model:
          name: "Xenova/bge-base-en-v1.5"  # different model for code
          pooling: "cls"
          normalize: true
```

## Automatic re-index

Each persisted graph JSON stores two fields that trigger re-indexing:
- **`version`** — a data schema version (`GRAPH_DATA_VERSION`). Bumped on changes to what gets embedded, path normalization, or stored format.
- **`embeddingModel`** — a fingerprint of the embedding config (model name + pooling + normalize + documentPrefix + dtype).

On load, if either field doesn't match the current values, the graph is automatically discarded and re-indexed from scratch.

## Model cache

Models are cached locally at `~/.graph-memory/models/` (configurable via `server.modelsDir`). First startup downloads the model; subsequent starts use the cache.

For Docker, mount a named volume to `/data/models/` to persist the cache across container restarts.
