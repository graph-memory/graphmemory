#### Skill Graph

Reusable recipes, procedures, troubleshooting guides, and established workflows with step-by-step instructions, trigger conditions, and usage tracking. Skills are automatically mirrored to `.skills/` directory as markdown files.

**What it stores:** skills with title, description, ordered steps, trigger keywords (when to apply), source (manual/extracted/generated), confidence level, usage count, and tags.

**Example queries:**
- `recall_skills({ context: "deploying to production" })` → finds deployment procedures relevant to the task
- `search_skills({ query: "debug memory leak" })` → finds troubleshooting guides by meaning
- `list_skills({ tag: "ci-cd" })` → lists all CI/CD related skills

**Key feature — `recall_skills`:** This is the primary way to use skills. Give it a task context (what you're about to do) and it returns the most relevant skills. Use this at the start of any workflow to avoid reinventing solutions.

**Usage tracking:** Call `bump_skill_usage` after applying a skill. This helps identify which procedures are most valuable and which may be outdated (low usage).

**Skill relationships:**
- `depends_on` — skill A requires skill B to be applied first
- `related_to` — skills that address similar concerns
- `variant_of` — alternative approach to the same problem

**Connections to other graphs (when enabled):**
- Code Graph: link skills to the code areas they apply to with `create_skill_link`
- Docs Graph: link skills to documentation they reference
- Knowledge Graph: link skills to notes that provide background context
- Task Graph: link skills to tasks they help complete
- File Index: attach reference files to skills with `add_skill_attachment`