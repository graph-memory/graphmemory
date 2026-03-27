// Roles
import developerRole from './roles/developer.md?raw';
import architectRole from './roles/architect.md?raw';
import reviewerRole from './roles/reviewer.md?raw';
import techWriterRole from './roles/tech-writer.md?raw';
import teamLeadRole from './roles/team-lead.md?raw';
import devopsRole from './roles/devops.md?raw';
import dataAnalystRole from './roles/data-analyst.md?raw';
import onboardingBuddyRole from './roles/onboarding-buddy.md?raw';

// Styles
import proactiveStyle from './styles/proactive.md?raw';
import reactiveStyle from './styles/reactive.md?raw';
import readOnlyStyle from './styles/read-only.md?raw';
import balancedStyle from './styles/balanced.md?raw';
import aggressiveStyle from './styles/aggressive.md?raw';
import guidedStyle from './styles/guided.md?raw';

// Graphs
import docsGraph from './graphs/docs.md?raw';
import codeGraph from './graphs/code.md?raw';
import filesGraph from './graphs/files.md?raw';
import knowledgeGraph from './graphs/knowledge.md?raw';
import tasksGraph from './graphs/tasks.md?raw';
import skillsGraph from './graphs/skills.md?raw';
import epicsGraph from './graphs/epics.md?raw';

// Scenarios
import onboardingWorkflow from './scenarios/onboarding.md?raw';
import developmentWorkflow from './scenarios/development.md?raw';
import codeReviewWorkflow from './scenarios/code-review.md?raw';
import bugInvestigationWorkflow from './scenarios/bug-investigation.md?raw';
import refactoringWorkflow from './scenarios/refactoring.md?raw';
import architectureWorkflow from './scenarios/architecture.md?raw';
import documentationWorkflow from './scenarios/documentation.md?raw';
import taskPlanningWorkflow from './scenarios/task-planning.md?raw';
import knowledgeCaptureWorkflow from './scenarios/knowledge-capture.md?raw';
import mentoringWorkflow from './scenarios/mentoring.md?raw';
import incidentResponseWorkflow from './scenarios/incident-response.md?raw';
import dependencyAuditWorkflow from './scenarios/dependency-audit.md?raw';
import sprintRetrospectiveWorkflow from './scenarios/sprint-retrospective.md?raw';
import customWorkflow from './scenarios/custom.md?raw';

// Template
import template from './template.md?raw';

export type GraphName = 'docs' | 'code' | 'files' | 'knowledge' | 'tasks' | 'skills' | 'epics';
export type RoleName = 'developer' | 'architect' | 'reviewer' | 'tech-writer' | 'team-lead' | 'devops' | 'data-analyst' | 'onboarding-buddy';
export type StyleName = 'proactive' | 'reactive' | 'read-only' | 'balanced' | 'aggressive' | 'guided';

export const ROLES: Record<RoleName, string> = {
  developer: developerRole,
  architect: architectRole,
  reviewer: reviewerRole,
  'tech-writer': techWriterRole,
  'team-lead': teamLeadRole,
  devops: devopsRole,
  'data-analyst': dataAnalystRole,
  'onboarding-buddy': onboardingBuddyRole,
};

export const STYLES: Record<StyleName, string> = {
  proactive: proactiveStyle,
  reactive: reactiveStyle,
  'read-only': readOnlyStyle,
  balanced: balancedStyle,
  aggressive: aggressiveStyle,
  guided: guidedStyle,
};

export const GRAPHS: Record<GraphName, string> = {
  docs: docsGraph,
  code: codeGraph,
  files: filesGraph,
  knowledge: knowledgeGraph,
  tasks: tasksGraph,
  skills: skillsGraph,
  epics: epicsGraph,
};

export const WORKFLOWS: Record<string, string> = {
  onboarding: onboardingWorkflow,
  development: developmentWorkflow,
  'code-review': codeReviewWorkflow,
  'bug-investigation': bugInvestigationWorkflow,
  refactoring: refactoringWorkflow,
  architecture: architectureWorkflow,
  documentation: documentationWorkflow,
  'task-planning': taskPlanningWorkflow,
  'knowledge-capture': knowledgeCaptureWorkflow,
  mentoring: mentoringWorkflow,
  'incident-response': incidentResponseWorkflow,
  'dependency-audit': dependencyAuditWorkflow,
  'sprint-retrospective': sprintRetrospectiveWorkflow,
  custom: customWorkflow,
};

export const TEMPLATE = template;

export const ALL_GRAPHS: GraphName[] = ['docs', 'code', 'files', 'knowledge', 'tasks', 'skills', 'epics'];

export const GRAPH_LABELS: Record<GraphName, string> = {
  docs: 'Documentation',
  code: 'Code',
  files: 'Files',
  knowledge: 'Knowledge',
  tasks: 'Tasks',
  skills: 'Skills',
  epics: 'Epics',
};

export const ROLE_LABELS: Record<RoleName, string> = {
  developer: 'Developer',
  architect: 'Architect',
  reviewer: 'Reviewer',
  'tech-writer': 'Tech Writer',
  'team-lead': 'Team Lead',
  devops: 'DevOps',
  'data-analyst': 'Data Analyst',
  'onboarding-buddy': 'Onboarding Buddy',
};

export const STYLE_LABELS: Record<StyleName, string> = {
  proactive: 'Proactive',
  reactive: 'Reactive',
  'read-only': 'Read-only',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
  guided: 'Guided',
};

// Tool catalog: all 67 tools with graph and description
export interface ToolInfo {
  graph: GraphName;
  description: string;
}


export const GRAPH_COLORS: Record<GraphName, string> = {
  docs: '#ef5350',
  code: '#42a5f5',
  files: '#66bb6a',
  knowledge: '#ffc107',
  tasks: '#7c4dff',
  skills: '#ff7043',
  epics: '#26c6da',
};

export const ROLE_OPTIONS: { value: RoleName; label: string; desc: string }[] = [
  { value: 'developer', label: 'Developer', desc: 'Write, debug, understand code' },
  { value: 'architect', label: 'Architect', desc: 'Design structure, evaluate patterns' },
  { value: 'reviewer', label: 'Reviewer', desc: 'Review changes for correctness' },
  { value: 'tech-writer', label: 'Tech Writer', desc: 'Write and maintain documentation' },
  { value: 'team-lead', label: 'Team Lead', desc: 'Manage tasks, track progress' },
  { value: 'devops', label: 'DevOps', desc: 'CI/CD, infra, deployment' },
  { value: 'data-analyst', label: 'Data Analyst', desc: 'Mine patterns, extract insights' },
  { value: 'onboarding-buddy', label: 'Onboarding Buddy', desc: 'Guide newcomers step by step' },
];

export const STYLE_OPTIONS: { value: StyleName; label: string; desc: string }[] = [
  { value: 'proactive', label: 'Proactive', desc: 'Act without asking' },
  { value: 'reactive', label: 'Reactive', desc: 'Suggest, wait for approval' },
  { value: 'read-only', label: 'Read-only', desc: 'Search only, never mutate' },
  { value: 'balanced', label: 'Balanced', desc: 'Search freely, ask before changes' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Maximum automation' },
  { value: 'guided', label: 'Guided', desc: 'Explain every step' },
];

export const TOOL_CATALOG: Record<string, ToolInfo> = {
  // Docs (10 tools) — search and browse indexed markdown documentation
  docs_search: { graph: 'docs', description: 'Hybrid semantic + keyword search over doc sections — finds documentation by meaning, not just exact words' },
  docs_search_files: { graph: 'docs', description: 'File-level semantic search — finds entire doc files relevant to a query' },
  docs_list_files: { graph: 'docs', description: 'List all indexed markdown files with their section counts' },
  docs_get_toc: { graph: 'docs', description: 'Table of contents for a doc file — shows heading hierarchy and section IDs' },
  docs_get_node: { graph: 'docs', description: 'Full markdown content of a specific doc section by its ID' },
  docs_find_examples: { graph: 'docs', description: 'Find code blocks in docs that contain a specific symbol name' },
  docs_search_snippets: { graph: 'docs', description: 'Semantic search over code blocks embedded in documentation' },
  docs_list_snippets: { graph: 'docs', description: 'List code blocks in docs with optional language and file filters' },
  docs_explain_symbol: { graph: 'docs', description: 'Show a code example from docs alongside its surrounding explanation text' },

  // Code (5 tools) — search and browse indexed TypeScript/JavaScript source
  code_search: { graph: 'code', description: 'Hybrid semantic + keyword search over code symbols — finds functions, classes, types by meaning' },
  code_search_files: { graph: 'code', description: 'File-level semantic search over source files — finds files relevant to a concept' },
  code_list_files: { graph: 'code', description: 'List all indexed source files with their symbol counts and paths' },
  code_get_file_symbols: { graph: 'code', description: 'List all symbols (functions, classes, interfaces, types) exported from a source file' },
  code_get_symbol: { graph: 'code', description: 'Full source code body of a specific symbol by its ID (e.g., "src/auth.ts::validateToken")' },
  docs_cross_references: { graph: 'docs', description: 'Show a code symbol\'s definition alongside all its documentation references and examples' },

  // Files (3 tools) — browse the complete project file tree
  files_search: { graph: 'files', description: 'Semantic search over all project files by path and name — finds any file type' },
  files_list: { graph: 'files', description: 'List files and directories with filters: directory, extension, language, type' },
  files_get_info: { graph: 'files', description: 'Full metadata for a file: size, language, MIME type, modified date, path' },

  // Knowledge (12 tools) — CRUD for notes, facts, and decisions
  notes_create: { graph: 'knowledge', description: 'Create a knowledge note with title, markdown content, and tags' },
  notes_update: { graph: 'knowledge', description: 'Update an existing note\'s title, content, or tags' },
  notes_delete: { graph: 'knowledge', description: 'Delete a note and all its relations and cross-graph links' },
  notes_get: { graph: 'knowledge', description: 'Fetch a note by ID with its full content, tags, and metadata' },
  notes_list: { graph: 'knowledge', description: 'List notes with optional text filter and tag filter' },
  notes_search: { graph: 'knowledge', description: 'Hybrid semantic + keyword search over knowledge notes' },
  notes_create_link: { graph: 'knowledge', description: 'Create a typed relation between notes or from a note to a code/doc/file/task/skill node' },
  notes_delete_link: { graph: 'knowledge', description: 'Delete a relation between nodes' },
  notes_list_links: { graph: 'knowledge', description: 'List all relations for a specific note — shows connected nodes and relation types' },
  notes_find_linked: { graph: 'knowledge', description: 'Find all notes linked to a target node in any graph (code, docs, files, tasks)' },
  notes_add_attachment: { graph: 'knowledge', description: 'Attach a file to a note for reference' },
  notes_remove_attachment: { graph: 'knowledge', description: 'Remove a file attachment from a note' },

  // Tasks (14 tools) — kanban task management with cross-graph links
  tasks_create: { graph: 'tasks', description: 'Create a task with title, description, priority (low/medium/high/critical), status, tags, assignee, due date' },
  tasks_update: { graph: 'tasks', description: 'Update any task fields: title, description, priority, tags, assignee, due date, estimate' },
  tasks_delete: { graph: 'tasks', description: 'Delete a task and all its relations, subtasks links, and cross-graph links' },
  tasks_get: { graph: 'tasks', description: 'Fetch a task with its full details, subtasks, blockers, and related items' },
  tasks_list: { graph: 'tasks', description: 'List tasks with filters: status, priority, tag, assignee — supports kanban views' },
  tasks_search: { graph: 'tasks', description: 'Hybrid semantic + keyword search over tasks — finds tasks by meaning' },
  tasks_move: { graph: 'tasks', description: 'Change task status (backlog→todo→in_progress→review→done/cancelled) — auto-manages completedAt' },
  tasks_link: { graph: 'tasks', description: 'Create a task-to-task relation: subtask_of, blocks, or related_to' },
  tasks_create_link: { graph: 'tasks', description: 'Link a task to another task or to a node in another graph (code, docs, files, knowledge, skills). Omit targetGraph for task-to-task links.' },
  tasks_delete_link: { graph: 'tasks', description: 'Remove a same-graph or cross-graph link from a task. Omit targetGraph for task-to-task links.' },
  tasks_find_linked: { graph: 'tasks', description: 'Find all tasks linked to a target node in any graph — shows what tasks affect a piece of code' },
  tasks_add_attachment: { graph: 'tasks', description: 'Attach a file to a task for reference' },
  tasks_remove_attachment: { graph: 'tasks', description: 'Remove a file attachment from a task' },
  tasks_reorder: { graph: 'tasks', description: 'Reorder tasks within a status column — sets explicit order for kanban display' },

  // Skills (14 tools) — reusable procedures, recipes, and troubleshooting guides
  skills_create: { graph: 'skills', description: 'Create a skill with title, description, ordered steps, trigger keywords, source, and confidence' },
  skills_update: { graph: 'skills', description: 'Update any skill fields: title, steps, triggers, confidence, tags' },
  skills_delete: { graph: 'skills', description: 'Delete a skill and all its relations and cross-graph links' },
  skills_get: { graph: 'skills', description: 'Fetch a skill with its full details, steps, relations, and cross-links' },
  skills_list: { graph: 'skills', description: 'List skills with filters: source (manual/extracted/generated), tag' },
  skills_search: { graph: 'skills', description: 'Hybrid semantic + keyword search over skills — finds procedures by meaning' },
  skills_recall: { graph: 'skills', description: 'Recall the most relevant skills for a given task context — the primary way to find applicable procedures' },
  skills_bump_usage: { graph: 'skills', description: 'Increment a skill\'s usage counter — call after applying a skill to track value' },
  skills_link: { graph: 'skills', description: 'Create a skill-to-skill relation: depends_on, related_to, or variant_of' },
  skills_create_link: { graph: 'skills', description: 'Link a skill to another skill or to a node in another graph (code, docs, files, knowledge, tasks). Omit targetGraph for skill-to-skill links.' },
  skills_delete_link: { graph: 'skills', description: 'Remove a same-graph or cross-graph link from a skill. Omit targetGraph for skill-to-skill links.' },
  skills_find_linked: { graph: 'skills', description: 'Find all skills linked to a target node in any graph' },
  skills_add_attachment: { graph: 'skills', description: 'Attach a file to a skill for reference' },
  skills_remove_attachment: { graph: 'skills', description: 'Remove a file attachment from a skill' },

  // Epics (8 tools) — milestone-level containers for grouping tasks
  epics_create: { graph: 'epics', description: 'Create an epic with title, description, status (draft/active/completed/archived), and tags' },
  epics_update: { graph: 'epics', description: 'Update any epic fields: title, description, status, tags' },
  epics_delete: { graph: 'epics', description: 'Delete an epic and all its edges — linked tasks are not deleted' },
  epics_get: { graph: 'epics', description: 'Fetch an epic with full details, linked tasks, and progress summary' },
  epics_list: { graph: 'epics', description: 'List epics with filters: status, tag — sorted by order then creation date' },
  epics_search: { graph: 'epics', description: 'Hybrid semantic + keyword search over epics — finds epics by meaning' },
  epics_link_task: { graph: 'epics', description: 'Link a task to an epic — creates a belongs_to edge' },
  epics_unlink_task: { graph: 'epics', description: 'Remove a task from an epic — deletes the belongs_to edge' },
};

export const ALL_TOOL_NAMES: string[] = Object.keys(TOOL_CATALOG);
