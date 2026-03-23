---
title: "Embeddings"
sidebar_label: "Embeddings"
sidebar_position: 9
description: "How Graph Memory generates embeddings locally for semantic search — default model, configuration, remote delegation, and embedding compression."
keywords: [embeddings, vectors, bge-m3, ONNX, semantic search, model, local, remote]
---

# Embeddings

Embeddings are the foundation of semantic search in Graph Memory. Every node — doc chunk, code symbol, note, task, skill, and file path — is converted into a high-dimensional vector that captures its meaning. Searching then compares your query vector against these stored vectors to find semantically similar content.

## Everything runs locally

Graph Memory runs embedding models **directly on your machine** using ONNX runtime. No data is sent to external APIs by default. Your code, notes, and documents stay private.

The model is downloaded once from HuggingFace and cached locally at `~/.graph-memory/models/`. Subsequent starts use the cache.

## Default model

The default model is **Xenova/bge-m3**:

| Property | Value |
|----------|-------|
| Dimensions | 1024 |
| Languages | 100+ (multilingual) |
| Context window | 8,192 tokens |
| Download size | ~560 MB |
| Quantization | q8 (8-bit, lower memory) |

This model provides strong multilingual performance and is suitable for most projects.

## Model configuration

Configure the embedding model in `graph-memory.yaml`:

```yaml
# Set at server level (applies to all projects)
model:
  name: "Xenova/bge-m3"
  pooling: "cls"
  normalize: true
  dtype: "q8"           # fp32, fp16, q8, or q4
```

### Alternative models

```yaml
# Smaller English-only model (~130 MB)
model:
  name: "Xenova/bge-small-en-v1.5"
  pooling: "cls"
  normalize: true
  queryPrefix: "Represent this sentence for searching relevant passages: "

# Nomic embed (good general-purpose)
model:
  name: "nomic-ai/nomic-embed-text-v1.5"
  pooling: "mean"
  normalize: true
  queryPrefix: "search_query: "
  documentPrefix: "search_document: "
```

:::tip
Use a smaller model like `bge-small-en-v1.5` if your project is English-only and you want faster indexing with lower memory usage.
:::

### Per-graph models

Different graphs can use different models. For example, use a smaller model for file path embeddings where full multilingual support is not needed:

```yaml
projects:
  my-app:
    model:
      name: "Xenova/bge-m3"         # default for most graphs
    graphs:
      files:
        model:
          name: "Xenova/bge-small-en-v1.5"   # lighter model for paths
          pooling: "cls"
          normalize: true
```

## Remote embedding API

For teams with a GPU server, you can delegate embedding computation to a remote machine instead of running models locally:

```yaml
server:
  embedding:
    remote: "http://gpu-server:3000/api/embed"
    remoteApiKey: "emb-secret-key"
```

When `remote` is set, Graph Memory sends text to the remote endpoint via HTTP instead of loading a local model. This is useful when:

- Your local machine lacks the memory for large models
- You want to centralize embedding on a GPU server
- Multiple developers share the same embedding service

:::info
Graph Memory can also **act as** the remote embedding server. Enable the Embedding API in your config to expose your local model as a REST endpoint that other instances can use.
:::

### Exposing your model as an API

```yaml
server:
  embeddingApi:
    enabled: true
    apiKey: "emb-secret-key"
    maxTexts: 100
    maxTextChars: 10000
```

This exposes `POST /api/embed` which accepts `{ "texts": ["..."] }` and returns `{ "embeddings": [[...]] }`. Pass `format: "base64"` in the request body to receive embeddings as Base64-encoded Float32 arrays instead of JSON number arrays.

## Lazy model loading

Embedding models are **registered at startup but not loaded into memory** until the first embedding is needed. The heavy ONNX pipeline — which can use 1 GB or more of RAM per model — is only initialized on first use. This keeps startup fast and avoids allocating memory for models that may not be needed immediately.

Additionally, ONNX Runtime session options are tuned to reduce memory overhead during inference.

## Three-phase sequential indexing

During initial indexing, Graph Memory processes graphs in a fixed order: **docs → files → code**. Each phase completes before the next begins. Because models are loaded lazily, this means only one embedding model is resident in memory at a time during indexing.

For multi-project setups where each project has its own model configuration, this reduces peak memory by up to **~3 GB** compared to loading all models simultaneously. Projects are indexed sequentially as well, so the memory footprint stays flat regardless of how many projects are configured.

:::tip
If you run multiple projects with per-graph models, the sequential indexing pipeline ensures you never have more than one model loaded at a time during the initial index pass.
:::

## Embedding compression

Embedding vectors are stored using **Base64 encoding** for compact serialization. Float32 arrays are encoded as Base64 strings, saving roughly 3x space compared to raw JSON number arrays. This compression is transparent — it happens automatically during save and load.

## Automatic re-index on model change

Each saved graph stores a fingerprint of the embedding configuration (model name, pooling, normalization, document prefix, quantization). When you change the model in your config and restart, Graph Memory detects the mismatch and **automatically re-indexes the graph from scratch**.

This means you can safely switch models — just update your config and restart. No manual re-indexing needed.

:::tip
If you change the embedding model, the first startup after the change will take longer as all graphs are re-indexed. Plan for this during off-peak times for large projects.
:::

## Embedding configuration reference

| Field | Default | Description |
|-------|---------|-------------|
| `model.name` | `Xenova/bge-m3` | HuggingFace model ID |
| `model.pooling` | `cls` | Pooling strategy (`mean` or `cls`) |
| `model.normalize` | `true` | L2-normalize output vectors |
| `model.dtype` | `q8` | Quantization level (`fp32`, `fp16`, `q8`, `q4`) |
| `model.queryPrefix` | `""` | Prefix prepended to search queries |
| `model.documentPrefix` | `""` | Prefix prepended to documents during indexing |
| `embedding.batchSize` | `1` | Texts per forward pass |
| `embedding.maxChars` | `24000` | Max characters per node |
| `embedding.cacheSize` | `10000` | Embedding cache size (0 = disabled) |
| `embedding.remote` | — | Remote embedding API URL |
| `embedding.remoteApiKey` | — | API key for remote endpoint |
| `embedding.remoteModel` | — | Which model to request: `"default"` or `"code"` (auto-set to `"code"` for code graph) |
