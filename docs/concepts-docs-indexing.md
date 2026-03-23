# How Documentation Indexing Works

## The idea

Documentation is the primary way developers communicate architecture, decisions, and usage patterns. But it's scattered across files, sections become outdated, and finding the right section requires knowing where to look.

Graph Memory solves this by treating documentation as a **semantic graph** — every section becomes a searchable node connected to neighboring sections and cross-referenced files. An LLM can navigate this graph the way a human would browse documentation, but faster and by meaning rather than keywords.

## From markdown to graph

### Step 1: Parse into chunks

A markdown file is split into **chunks** at heading boundaries. The `chunkDepth` parameter (default 4) controls granularity:

```markdown
# Authentication Guide        → level 1 (file root)

Overview text...

## JWT Tokens                  → level 2 (chunk boundary)

Explanation of JWTs...

### Token Format               → level 3 (chunk boundary)

The token consists of...

#### Header Fields             → level 4 (chunk boundary)

The header contains...

##### alg field                → level 5 (folded into parent at depth 4)

Specifies the algorithm...
```

Key principles:
- **`#` heading** = file title, becomes the root chunk (level 1)
- **`##` through `####`** (up to `chunkDepth`) = each becomes its own chunk
- **Deeper headings** (e.g. `#####` when `chunkDepth=4`) are folded into their parent chunk's content — they don't get their own node
- **Empty sections** (heading with no text) are skipped
- **Duplicate headings** within a file get dedup suffixes: `::2`, `::3`

### Step 2: Extract links

Each chunk's content is scanned for cross-file references:

- **Markdown links**: `[Setup guide](./setup.md)` — resolved relative to the file's directory
- **Wiki links**: `[[Setup Guide]]` or `[[Setup Guide|click here]]` — searched recursively within the project directory. The wiki index is cached per project and automatically invalidated when `.md` files are added or removed during watch mode
- **External links** (`https://...`, `mailto:`, data URIs) are ignored
- Only links to files that **actually exist on disk** are recorded — broken links are silently skipped

These links create **cross-file edges** in the graph, connecting a chunk to the root node of the referenced file. This enables BFS search to follow documentation structure naturally.

### Step 3: Extract code blocks

Fenced code blocks inside markdown are extracted as **child chunks**:

````markdown
## Authentication

Here's how to create a JWT token:

```typescript
const token = jwt.sign({ userId }, secret, { expiresIn: '1h' });
```
````

The code block becomes a separate node with:
- ID: `"docs/auth.md::Authentication::code-1"` (parent ID + sequential index)
- Level: parent level + 1
- Language: from the fence tag (`typescript`, `python`, etc.)
- Symbols: for TS/JS/TSX/JSX blocks, top-level symbol names are extracted via tree-sitter parsing

This means you can search for code examples by the symbols they define, or by semantic content.

### Step 4: Embed everything

Each chunk is embedded into a vector using the configured model (default: `Xenova/bge-m3`). The embedding captures the **semantic meaning** of `title + content`, enabling similarity-based search.

Root nodes additionally get a `fileEmbedding` — embedded from `file path + h1 title` — used for file-level search ("find docs about authentication").

Chunks are embedded in **batch** — all chunks from a single file in one forward pass for efficiency.

### Step 5: Build the graph

The resulting graph structure:

```
docs/auth.md (root, level 1)
  ├── [sibling] → docs/auth.md::JWT Tokens (level 2)
  │                 ├── [sibling] → docs/auth.md::Token Format (level 3)
  │                 │                 └── [sibling] → docs/auth.md::Header Fields (level 4)
  │                 └── [child] → docs/auth.md::JWT Tokens::code-1 (code block)
  └── [cross-file] → docs/setup.md (linked via [text](./setup.md))
```

Edges:
- **Sibling edges**: connect sequential chunks within the same file (preserving reading order)
- **Cross-file edges**: connect a chunk to the root of any file it references
- **Parent-child (implicit)**: code blocks are children of their containing section

## Incremental updates

When a file changes:
1. All old nodes for that file are removed from the graph
2. The file is re-parsed and re-embedded
3. New nodes and edges replace the old ones

The `mtime` check skips files that haven't changed — only modified files are re-processed.

## What this enables

### Semantic search

"How does authentication work?" → finds the JWT Tokens section even if the word "authentication" only appears in the file title, not the section itself. BFS expansion follows sibling and cross-file edges to surface related content.

### Code examples in docs

"Show me how to create a JWT" → finds the code block in the Authentication section, complete with the surrounding explanation text.

### Symbol bridging

`cross_references("loginUser")` → finds both the code definition (from CodeGraph) AND documentation examples (from DocGraph code blocks) that reference the symbol.

### File-level search

"Find docs about deployment" → `search_topic_files` uses file-level embeddings to quickly identify relevant documentation files before drilling into sections.

## Configuration

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    chunkDepth: 4                   # heading depth for chunk boundaries
    embedding:
      maxChars: 24000               # max chars per chunk for embedding
    graphs:
      docs:
        include: "**/*.md"          # default — indexes all markdown files
        exclude: "**/drafts/**"     # skip certain paths
        enabled: true               # can be disabled entirely
```
