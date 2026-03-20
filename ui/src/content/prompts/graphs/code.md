#### Code Graph

Indexed TypeScript/JavaScript source code — every `.ts`, `.js`, `.tsx`, `.jsx` file is parsed with tree-sitter into a graph of symbols: functions, classes, interfaces, types, enums, and their relationships (exports, imports, inheritance).

**What gets indexed:** function/method declarations with full bodies, class definitions with methods, interface and type alias declarations, enum definitions, export relationships, JSDoc/TSDoc comments.

**Example queries:**
- `search_code({ query: "validate user input" })` → finds validation functions by semantic meaning
- `get_file_symbols({ filePath: "src/auth/middleware.ts" })` → lists all symbols in the file
- `get_symbol({ id: "src/auth/middleware.ts::authMiddleware" })` → full source code of the function

**Connections to other graphs (when enabled):**
- Docs Graph: `cross_references` shows code + matching doc examples side by side
- Task Graph: `find_linked_tasks` shows tasks affecting a code symbol
- Knowledge Graph: `find_linked_notes` shows notes about a code area
- Skill Graph: `find_linked_skills` shows procedures related to code