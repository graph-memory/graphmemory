---
title: "Docs Indexing"
sidebar_label: "Docs Indexing"
sidebar_position: 2
description: "How Graph Memory indexes markdown documentation into searchable, interconnected sections."
keywords: [docs, indexing, markdown, search, wiki links, documentation, chunks]
---

# Docs Indexing

Graph Memory automatically indexes your markdown documentation so your AI assistant can search it by meaning, browse it by topic, and follow cross-references between files.

## What gets indexed

By default, all `*.md` files in your project are indexed. You can customize this with include/exclude patterns:

```yaml
graphs:
  docs:
    include: "**/*.md"        # default
    exclude: "**/drafts/**"   # skip certain paths
```

## How markdown becomes searchable

### Splitting by headings

Each markdown file is split into **sections** at heading boundaries. A heading and all the text beneath it (until the next heading of equal or higher level) becomes one searchable unit.

```markdown
# Authentication Guide        → section 1 (file title)

Overview text...

## JWT Tokens                  → section 2

Explanation of JWTs...

### Token Format               → section 3

The token consists of...
```

This means a search for "token format" returns just the relevant section, not the entire file.

The `chunkDepth` setting (default: 4) controls how deep the splitting goes. Headings below the chunk depth are folded into their parent section. For example, with `chunkDepth: 4`, a `#####` heading is included in the content of its `####` parent rather than becoming its own section.

:::tip
If your docs have very deep heading hierarchies and you want more granular search results, increase `chunkDepth`. If you prefer broader sections, lower it.
:::

### Empty sections are skipped

If a heading has no content beneath it (just the heading text with nothing before the next heading), it won't create a section in the graph. This keeps the index clean.

### Duplicate headings

If the same heading text appears more than once in a file (e.g., multiple `## Example` sections), they are automatically deduplicated with suffixes: the first stays as-is, the second gets `::2`, the third gets `::3`, and so on.

## Cross-file links

Graph Memory detects links between documentation files and preserves them as connections in the graph. This means searching for one topic can surface related topics from linked files.

### Markdown links

Standard markdown links to other files are detected and resolved:

```markdown
See the [setup guide](./setup.md) for installation instructions.
```

Links are resolved relative to the current file's directory. Only links to files that actually exist on disk are recorded -- broken links are silently skipped.

### Wiki links

Graph Memory also supports wiki-style links:

```markdown
See [[Setup Guide]] for installation instructions.
See [[Setup Guide|click here]] for a labeled link.
```

Wiki links are matched by searching for files whose name or title matches the link text. This is useful if you use tools like Obsidian or Foam that use wiki-link syntax.

:::info
External links (URLs starting with `https://`, `mailto:`, etc.) are ignored -- only links to local files within your project are indexed.
:::

## Code blocks in docs

Fenced code blocks inside markdown are extracted as separate searchable items:

````markdown
## Authentication

Here's how to create a JWT token:

```typescript
const token = jwt.sign({ userId }, secret, { expiresIn: '1h' });
```
````

The code block becomes its own searchable node. For TypeScript and JavaScript code blocks, symbol names are also extracted, so you can find documentation examples by the functions or classes they demonstrate.

This is especially useful with the `find_examples` tool -- search for code examples across your documentation:

```
find_examples({ symbol: "JWT token creation" })
```

## Searching documentation

Graph Memory provides several ways to search your docs:

### Semantic search

```
search({ query: "how does authentication work?" })
```

Finds sections by meaning, not just keyword matching. If the word "authentication" only appears in the file title but the section explains JWT tokens, it will still be found.

### File-level search

```
search_topic_files({ query: "deployment" })
```

Quickly identifies which documentation files are relevant to a topic, before drilling into specific sections.

### Table of contents

```
get_toc({ fileId: "docs/auth.md" })
```

Returns the heading structure of a documentation file, similar to a sidebar table of contents.

### Read a specific section

```
get_node({ nodeId: "docs/auth.md::JWT Tokens" })
```

Returns the full content of a specific section by its ID.

## Incremental updates

When you modify a markdown file, only that file is re-processed on the next index cycle. Files that haven't changed (based on modification time) are skipped. This keeps re-indexing fast even for large documentation sets.

## Configuration

```yaml
projects:
  my-app:
    projectDir: "/path/to/my-app"
    chunkDepth: 4                   # heading depth for section boundaries
    graphs:
      docs:
        include: "**/*.md"          # file pattern to index
        exclude: "**/node_modules/**"
        enabled: true               # set to false to disable docs indexing
```
