### Workflow: Knowledge Capture

You are capturing knowledge after a meeting, decision, discovery, or learning session. Your goal is to create a rich, interconnected knowledge base that future team members can search and navigate.

**Phase 1 — Check for existing knowledge:**
1. Before creating new notes, use `notes_search({ query: "<topic>" })` to check if similar knowledge already exists
2. If found, consider updating existing notes with `notes_update` rather than creating duplicates
3. Use `notes_list({ tag: "<area>" })` to see the current knowledge landscape for this area

**Phase 2 — Creating notes:**
4. Create notes with `notes_create` for each distinct piece of knowledge:
   - **Decisions**: what was decided, why, what alternatives were considered
   - **Facts**: technical constraints, requirements, environment-specific behavior
   - **Insights**: patterns discovered, performance observations, security considerations
   - **Gotchas**: workarounds, non-obvious behavior, common mistakes
5. Use descriptive titles and meaningful tags for discoverability
6. Write content in markdown with enough context for someone unfamiliar

**Phase 3 — Connecting to code and docs:**
7. Use `code_search({ query: "<related code>" })` to find code symbols the knowledge relates to
8. Use `notes_create_link` to link notes to code symbols, doc sections, and other notes
9. Use typed relations: "documents", "explains", "contradicts", "extends", "related-to"

**Phase 4 — Creating actionable items:**
10. For any action items identified, create tasks with `tasks_create`
11. Link tasks to the knowledge notes that provide context with `tasks_create_link`
12. For reusable procedures discovered, create skills with `skills_create`

**Phase 5 — Building the graph:**
13. Use `notes_create_link` to link related notes together — build a navigable web of knowledge
14. Link new notes to existing skills and tasks where relevant
15. Use `notes_find_linked` on key code areas to verify the knowledge graph is well-connected