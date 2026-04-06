---
slug: local-embeddings
title: "Why We Chose Local Embeddings Over API Calls"
authors: [graphmemory]
tags: [engineering, architecture, embeddings, privacy]
description: "Graph Memory runs embeddings locally with ONNX Runtime instead of calling OpenAI. Here's why, and the trade-offs we made."
---

Graph Memory generates vector embeddings for every node in every graph — doc chunks, code symbols, files, notes, tasks, skills. We run these embeddings locally using ONNX Runtime, not through an API like OpenAI's. This was a deliberate choice with real trade-offs.

<!-- truncate -->

## How it works

Graph Memory uses the [@huggingface/transformers](https://github.com/huggingface/transformers.js) library to run ONNX models directly in Node.js. The default model is `Xenova/jina-embeddings-v2-small-en`, a lightweight English embedding model quantized to 8-bit (`q8` dtype) for smaller size and faster inference.

For code-specific embeddings, we use `jinaai/jina-embeddings-v2-base-code` — a model trained specifically on source code that understands programming language semantics better than general-purpose models.

Here's the core of the embedding pipeline:

```typescript
const pipe = await pipeline('feature-extraction', model.name, {
  dtype: 'q8',
  session_options: {
    enableCpuMemArena: false,
    enableMemPattern: false,
    executionMode: 'sequential',
  },
});

const tensor = await pipe._call(text, {
  pooling: 'mean',
  normalize: true,
});
const vector = Array.from(tensor.data as Float32Array);
```

Models are registered for lazy loading — the ONNX pipeline isn't created until the first embedding is actually needed. This keeps startup fast and memory usage low when not all graphs are actively queried.

## The download cost

The first time you run Graph Memory, it downloads the model weights. For `Xenova/jina-embeddings-v2-small-en` at q8 quantization, that's roughly 33 MB. The models are cached in a local directory (configurable via `modelsDir` in your config), so subsequent starts are fast.

The download is small enough that first-run friction is minimal. After that, the model loads from disk in seconds.

## Why not use an API?

We considered using OpenAI's embedding API (`text-embedding-3-small` or `text-embedding-3-large`). Here's why we went local:

**Privacy.** Graph Memory indexes your entire codebase — every function, every doc, every file path. Sending all of that to an external API means your code leaves your machine. For many teams, that's a non-starter. With local embeddings, nothing leaves your machine. Ever.

**Cost.** OpenAI's `text-embedding-3-small` costs $0.02 per million tokens. Sounds cheap until you're indexing a large codebase. A project with 10,000 code symbols and 500 doc chunks, each embedded with surrounding context, can easily hit millions of tokens. And you pay again every time you re-index. With local embeddings, the cost is $0 — you're just using your own CPU.

**Offline work.** Local embeddings work without internet. Index your project on a plane. Search your code graph in a coffee shop with bad wifi. API embeddings fail when the network fails.

**Latency consistency.** API calls have variable latency — 50ms on a good day, 500ms+ when the service is busy. Local embeddings on a modern CPU take 5-20ms per text after the model is loaded. No cold starts, no rate limits, no retry logic needed.

## The trade-offs

Local isn't free. Here's what you give up:

**First-load latency.** Loading the ONNX model takes a few seconds. The first embedding call pays this cost. We mitigate this with lazy loading — models only load when first needed — and pipeline deduplication, so if two graphs use the same model, they share one pipeline.

**CPU usage during indexing.** Initial indexing of a large codebase is CPU-intensive. We run indexing in three sequential phases (docs, then files, then code) to avoid loading multiple models simultaneously and keep memory usage predictable.

**Model quality.** The largest commercial embedding models (like OpenAI's `text-embedding-3-large` at 3072 dimensions) may produce marginally better embeddings than a quantized open-source model. In practice, we haven't found this to matter for code search — the hybrid search approach (BM25 + vector + graph expansion) compensates for any quality gap in the embeddings alone.

## Caching

Every embedding result is cached in an LRU cache (default: 10,000 entries per model). If you search for the same query twice, the second search skips the model entirely.

For production deployments, Graph Memory supports Redis-backed embedding caches. The cache is keyed by a SHA-256 hash of the input text, and vectors are stored as base64-encoded float32 arrays. You can configure TTL per cache:

```yaml
server:
  redis:
    enabled: true
    url: redis://localhost:6379
    embeddingCacheTtl: 7d
```

The Redis cache is shared across server restarts, so re-indexing after a restart can skip embeddings that haven't changed.

## Remote embeddings as an escape hatch

If you do want API-based embeddings — maybe you need a specific model, or you're running on a machine without enough RAM for ONNX — Graph Memory supports remote embedding endpoints:

```yaml
server:
  embedding:
    remote: "https://your-embedding-api.com/embed"
    remoteApiKey: "sk-..."
    remoteModel: "text-embedding-3-small"
```

The remote endpoint receives a `POST` with `{ texts: string[] }` and returns `{ embeddings: number[][] }`. Retries with exponential backoff are built in for 5xx errors.

This gives you the best of both worlds: local by default, remote when you need it.

## The result

For most users, local embeddings are the right default. Your code stays on your machine, indexing costs nothing, and search works offline. The initial model download is a one-time cost that pays for itself immediately.

The hybrid search architecture means embedding quality isn't the whole story anyway — BM25 keyword matching catches what vectors miss, and graph expansion surfaces related nodes that no embedding model would connect. Local embeddings are one piece of a system designed to be greater than the sum of its parts.
