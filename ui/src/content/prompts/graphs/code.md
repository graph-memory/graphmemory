#### Code Graph

Indexed TypeScript/JavaScript source code — every `.ts`, `.js`, `.tsx`, `.jsx` file is parsed with tree-sitter into a graph of symbols: functions, classes, interfaces, types, enums, and their relationships (exports, imports, inheritance).

**What gets indexed:** function/method declarations with full bodies, class definitions with methods, interface and type alias declarations, enum definitions, export relationships, JSDoc/TSDoc comments.

**Example queries:**
- `code_search({ query: "validate user input" })` → finds validation functions by semantic meaning
- `code_get_file_symbols({ filePath: "src/auth/middleware.ts" })` → lists all symbols in the file
- `code_get_symbol({ id: "src/auth/middleware.ts::authMiddleware" })` → full source code of the function

**Connections to other graphs (when enabled):**
- Docs Graph: `docs_cross_references` shows code + matching doc examples side by side
- Task Graph: `tasks_find_linked` shows tasks affecting a code symbol
- Knowledge Graph: `notes_find_linked` shows notes about a code area
- Skill Graph: `skills_find_linked` shows procedures related to code