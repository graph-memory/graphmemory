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

export type GraphName = 'docs' | 'code' | 'files' | 'knowledge' | 'tasks' | 'skills';
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

export const ALL_GRAPHS: GraphName[] = ['docs', 'code', 'files', 'knowledge', 'tasks', 'skills'];

export const GRAPH_LABELS: Record<GraphName, string> = {
  docs: 'Documentation',
  code: 'Code',
  files: 'Files',
  knowledge: 'Knowledge',
  tasks: 'Tasks',
  skills: 'Skills',
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

// Tool catalog: all 57 tools with graph and description
export interface ToolInfo {
  graph: GraphName;
  description: string;
}

export const TOOL_CATALOG: Record<string, ToolInfo> = {
  // Docs (9 tools) — search and browse indexed markdown documentation
  search: { graph: 'docs', description: 'Hybrid semantic + keyword search over doc sections — finds documentation by meaning, not just exact words' },
  search_topic_files: { graph: 'docs', description: 'File-level semantic search — finds entire doc files relevant to a query' },
  list_topics: { graph: 'docs', description: 'List all indexed markdown files with their section counts' },
  get_toc: { graph: 'docs', description: 'Table of contents for a doc file — shows heading hierarchy and section IDs' },
  get_node: { graph: 'docs', description: 'Full markdown content of a specific doc section by its ID' },
  find_examples: { graph: 'docs', description: 'Find code blocks in docs that contain a specific symbol name' },
  search_snippets: { graph: 'docs', description: 'Semantic search over code blocks embedded in documentation' },
  list_snippets: { graph: 'docs', description: 'List code blocks in docs with optional language and file filters' },
  explain_symbol: { graph: 'docs', description: 'Show a code example from docs alongside its surrounding explanation text' },

  // Code (6 tools) — search and browse indexed TypeScript/JavaScript source
  search_code: { graph: 'code', description: 'Hybrid semantic + keyword search over code symbols — finds functions, classes, types by meaning' },
  search_files: { graph: 'code', description: 'File-level semantic search over source files — finds files relevant to a concept' },
  list_files: { graph: 'code', description: 'List all indexed source files with their symbol counts and paths' },
  get_file_symbols: { graph: 'code', description: 'List all symbols (functions, classes, interfaces, types) exported from a source file' },
  get_symbol: { graph: 'code', description: 'Full source code body of a specific symbol by its ID (e.g., "src/auth.ts::validateToken")' },
  cross_references: { graph: 'code', description: 'Show a code symbol\'s definition alongside all its documentation references and examples' },

  // Files (3 tools) — browse the complete project file tree
  search_all_files: { graph: 'files', description: 'Semantic search over all project files by path and name — finds any file type' },
  list_all_files: { graph: 'files', description: 'List files and directories with filters: directory, extension, language, type' },
  get_file_info: { graph: 'files', description: 'Full metadata for a file: size, language, MIME type, modified date, path' },

  // Knowledge (12 tools) — CRUD for notes, facts, and decisions
  create_note: { graph: 'knowledge', description: 'Create a knowledge note with title, markdown content, and tags' },
  update_note: { graph: 'knowledge', description: 'Update an existing note\'s title, content, or tags' },
  delete_note: { graph: 'knowledge', description: 'Delete a note and all its relations and cross-graph links' },
  get_note: { graph: 'knowledge', description: 'Fetch a note by ID with its full content, tags, and metadata' },
  list_notes: { graph: 'knowledge', description: 'List notes with optional text filter and tag filter' },
  search_notes: { graph: 'knowledge', description: 'Hybrid semantic + keyword search over knowledge notes' },
  create_relation: { graph: 'knowledge', description: 'Create a typed relation between notes or from a note to a code/doc/file/task/skill node' },
  delete_relation: { graph: 'knowledge', description: 'Delete a relation between nodes' },
  list_relations: { graph: 'knowledge', description: 'List all relations for a specific note — shows connected nodes and relation types' },
  find_linked_notes: { graph: 'knowledge', description: 'Find all notes linked to a target node in any graph (code, docs, files, tasks)' },
  add_note_attachment: { graph: 'knowledge', description: 'Attach a file to a note for reference' },
  remove_note_attachment: { graph: 'knowledge', description: 'Remove a file attachment from a note' },

  // Tasks (13 tools) — kanban task management with cross-graph links
  create_task: { graph: 'tasks', description: 'Create a task with title, description, priority (low/medium/high/critical), status, tags, assignee, due date' },
  update_task: { graph: 'tasks', description: 'Update any task fields: title, description, priority, tags, assignee, due date, estimate' },
  delete_task: { graph: 'tasks', description: 'Delete a task and all its relations, subtasks links, and cross-graph links' },
  get_task: { graph: 'tasks', description: 'Fetch a task with its full details, subtasks, blockers, and related items' },
  list_tasks: { graph: 'tasks', description: 'List tasks with filters: status, priority, tag, assignee — supports kanban views' },
  search_tasks: { graph: 'tasks', description: 'Hybrid semantic + keyword search over tasks — finds tasks by meaning' },
  move_task: { graph: 'tasks', description: 'Change task status (backlog→todo→in_progress→review→done/cancelled) — auto-manages completedAt' },
  link_task: { graph: 'tasks', description: 'Create a task-to-task relation: subtask_of, blocks, or related_to' },
  create_task_link: { graph: 'tasks', description: 'Link a task to a node in another graph (code symbol, doc section, file, note, skill)' },
  delete_task_link: { graph: 'tasks', description: 'Remove a cross-graph link from a task' },
  find_linked_tasks: { graph: 'tasks', description: 'Find all tasks linked to a target node in any graph — shows what tasks affect a piece of code' },
  add_task_attachment: { graph: 'tasks', description: 'Attach a file to a task for reference' },
  remove_task_attachment: { graph: 'tasks', description: 'Remove a file attachment from a task' },

  // Skills (14 tools) — reusable procedures, recipes, and troubleshooting guides
  create_skill: { graph: 'skills', description: 'Create a skill with title, description, ordered steps, trigger keywords, source, and confidence' },
  update_skill: { graph: 'skills', description: 'Update any skill fields: title, steps, triggers, confidence, tags' },
  delete_skill: { graph: 'skills', description: 'Delete a skill and all its relations and cross-graph links' },
  get_skill: { graph: 'skills', description: 'Fetch a skill with its full details, steps, relations, and cross-links' },
  list_skills: { graph: 'skills', description: 'List skills with filters: source (manual/extracted/generated), tag' },
  search_skills: { graph: 'skills', description: 'Hybrid semantic + keyword search over skills — finds procedures by meaning' },
  recall_skills: { graph: 'skills', description: 'Recall the most relevant skills for a given task context — the primary way to find applicable procedures' },
  bump_skill_usage: { graph: 'skills', description: 'Increment a skill\'s usage counter — call after applying a skill to track value' },
  link_skill: { graph: 'skills', description: 'Create a skill-to-skill relation: depends_on, related_to, or variant_of' },
  create_skill_link: { graph: 'skills', description: 'Link a skill to a node in another graph (code, docs, files, knowledge, tasks)' },
  delete_skill_link: { graph: 'skills', description: 'Remove a cross-graph link from a skill' },
  find_linked_skills: { graph: 'skills', description: 'Find all skills linked to a target node in any graph' },
  add_skill_attachment: { graph: 'skills', description: 'Attach a file to a skill for reference' },
  remove_skill_attachment: { graph: 'skills', description: 'Remove a file attachment from a skill' },
};
