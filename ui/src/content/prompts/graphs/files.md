#### File Index Graph

Complete project file tree — every file and directory with metadata, language detection, MIME types, and size information. This is the broadest graph, covering all files regardless of type.

**What gets indexed:** file paths, directory structure, file sizes, modification times, detected programming language, MIME type, file extension.

**Example queries:**
- `search_all_files({ query: "docker configuration" })` → finds Dockerfiles, docker-compose.yml
- `list_all_files({ directory: "src/", extension: ".ts" })` → lists all TypeScript files in src/
- `get_file_info({ path: "package.json" })` → full metadata including size, type, modified date

**Use cases:**
- Understanding project structure and organization before diving into code
- Finding configuration files (tsconfig, eslint, prettier, CI configs)
- Discovering non-code files (scripts, templates, assets, data files)
- Checking what files exist in a directory without reading them

**Connections to other graphs (when enabled):**
- Code Graph: source files in File Index have corresponding symbol-level detail in Code Graph
- Docs Graph: markdown files in File Index have section-level detail in Docs Graph
- Task Graph: tasks can link to any file via `create_task_link`