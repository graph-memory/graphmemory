#### Knowledge Graph

User-created notes, facts, decisions, and insights with typed relations and cross-graph links. Notes are automatically mirrored to `.notes/` directory as markdown files that can be edited in any IDE.

**What it stores:** notes with title, markdown content, and tags. Each note can have typed relations to other notes (e.g., "related-to", "contradicts", "extends") and cross-graph links to code symbols, doc sections, files, tasks, and skills.

**Example queries:**
- `search_notes({ query: "why we chose JWT over sessions" })` → finds the decision note
- `list_notes({ tag: "architecture" })` → lists all architecture-related notes
- `find_linked_notes({ targetId: "src/auth/middleware.ts::authMiddleware" })` → finds notes about auth middleware

**Use cases:**
- Capturing decisions and their rationale (ADRs, design choices)
- Recording non-obvious behavior, workarounds, and gotchas
- Building a searchable knowledge base of project-specific context
- Linking scattered knowledge to the code and docs it relates to

**Connections to other graphs (when enabled):**
- Code Graph: link notes to code symbols they describe with `create_relation`
- Docs Graph: link notes to doc sections they reference
- Task Graph: link notes to tasks that implement or track the noted issue
- Skill Graph: link notes to skills that document the procedure
- File Index: attach files to notes with `add_note_attachment`