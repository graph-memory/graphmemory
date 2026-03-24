#### Documentation Graph

Indexed markdown documentation — every `.md` file is parsed into a tree of sections by heading hierarchy. Each section, code block, and cross-file link becomes a searchable node.

**What gets indexed:** heading sections with content, fenced code blocks (with language detection), internal links between documents, front matter metadata.

**Example queries:**
- `docs_search({ query: "authentication flow" })` → finds the doc section describing JWT auth
- `docs_find_examples({ symbol: "createServer" })` → finds code blocks mentioning `createServer`
- `docs_explain_symbol({ symbol: "middleware" })` → returns code example + surrounding explanation

**Connections to other graphs (when enabled):**
- Code Graph: `docs_cross_references` links code symbols to their documentation
- Knowledge Graph: notes can reference doc sections via `notes_create_link`
- Task Graph: tasks can link to doc sections they affect via `tasks_create_link`