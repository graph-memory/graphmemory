// Roles
import developerRole from './roles/developer.md?raw';
import architectRole from './roles/architect.md?raw';
import reviewerRole from './roles/reviewer.md?raw';
import techWriterRole from './roles/tech-writer.md?raw';
import teamLeadRole from './roles/team-lead.md?raw';

// Styles
import proactiveStyle from './styles/proactive.md?raw';
import reactiveStyle from './styles/reactive.md?raw';
import readOnlyStyle from './styles/read-only.md?raw';

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

// Template
import template from './template.md?raw';

export type GraphName = 'docs' | 'code' | 'files' | 'knowledge' | 'tasks' | 'skills';
export type RoleName = 'developer' | 'architect' | 'reviewer' | 'tech-writer' | 'team-lead';
export type StyleName = 'proactive' | 'reactive' | 'read-only';

export const ROLES: Record<RoleName, string> = {
  developer: developerRole,
  architect: architectRole,
  reviewer: reviewerRole,
  'tech-writer': techWriterRole,
  'team-lead': teamLeadRole,
};

export const STYLES: Record<StyleName, string> = {
  proactive: proactiveStyle,
  reactive: reactiveStyle,
  'read-only': readOnlyStyle,
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
};

export const STYLE_LABELS: Record<StyleName, string> = {
  proactive: 'Proactive',
  reactive: 'Reactive',
  'read-only': 'Read-only',
};

// Tool catalog: all 57 tools with graph and description
export interface ToolInfo {
  graph: GraphName;
  description: string;
}

export const TOOL_CATALOG: Record<string, ToolInfo> = {
  // Docs
  search: { graph: 'docs', description: 'Hybrid search over doc sections by meaning' },
  search_topic_files: { graph: 'docs', description: 'File-level semantic search over docs' },
  list_topics: { graph: 'docs', description: 'List all indexed markdown files' },
  get_toc: { graph: 'docs', description: 'Table of contents for a doc file' },
  get_node: { graph: 'docs', description: 'Full content of a doc section by ID' },
  find_examples: { graph: 'docs', description: 'Find code blocks containing a specific symbol' },
  search_snippets: { graph: 'docs', description: 'Semantic search over code blocks in docs' },
  list_snippets: { graph: 'docs', description: 'List code blocks with filters' },
  explain_symbol: { graph: 'docs', description: 'Code example + surrounding explanation for a symbol' },
  // Code
  search_code: { graph: 'code', description: 'Hybrid search over code symbols by meaning' },
  search_files: { graph: 'code', description: 'File-level semantic search over source files' },
  list_files: { graph: 'code', description: 'List all indexed source files with symbol counts' },
  get_file_symbols: { graph: 'code', description: 'List all symbols in a source file' },
  get_symbol: { graph: 'code', description: 'Full source body of a symbol by ID' },
  cross_references: { graph: 'code', description: 'Code definition + doc examples for a symbol' },
  // Files
  search_all_files: { graph: 'files', description: 'Semantic search over all files by path' },
  list_all_files: { graph: 'files', description: 'List files/dirs with filters' },
  get_file_info: { graph: 'files', description: 'Full metadata for a file or directory' },
  // Knowledge
  create_note: { graph: 'knowledge', description: 'Create a note with title, content, and tags' },
  update_note: { graph: 'knowledge', description: 'Update note title, content, or tags' },
  delete_note: { graph: 'knowledge', description: 'Delete a note and all its relations' },
  get_note: { graph: 'knowledge', description: 'Fetch a note by ID' },
  list_notes: { graph: 'knowledge', description: 'List notes with optional filter and tag' },
  search_notes: { graph: 'knowledge', description: 'Hybrid search over notes' },
  create_relation: { graph: 'knowledge', description: 'Create relation between notes or to other graphs' },
  delete_relation: { graph: 'knowledge', description: 'Delete a relation' },
  list_relations: { graph: 'knowledge', description: 'List all relations for a note' },
  find_linked_notes: { graph: 'knowledge', description: 'Find notes linked to a target node' },
  add_note_attachment: { graph: 'knowledge', description: 'Attach a file to a note' },
  remove_note_attachment: { graph: 'knowledge', description: 'Remove an attachment' },
  // Tasks
  create_task: { graph: 'tasks', description: 'Create a task with title, description, priority, status' },
  update_task: { graph: 'tasks', description: 'Update any task fields' },
  delete_task: { graph: 'tasks', description: 'Delete a task and all its relations' },
  get_task: { graph: 'tasks', description: 'Fetch task with subtasks, blockers, and related' },
  list_tasks: { graph: 'tasks', description: 'List tasks with filters (status, priority, tag)' },
  search_tasks: { graph: 'tasks', description: 'Hybrid search over tasks' },
  move_task: { graph: 'tasks', description: 'Change task status (auto-manages completedAt)' },
  link_task: { graph: 'tasks', description: 'Create task-to-task relation' },
  create_task_link: { graph: 'tasks', description: 'Link task to a doc/code/file/knowledge node' },
  delete_task_link: { graph: 'tasks', description: 'Remove a cross-graph link' },
  find_linked_tasks: { graph: 'tasks', description: 'Find tasks linked to a target node' },
  add_task_attachment: { graph: 'tasks', description: 'Attach a file to a task' },
  remove_task_attachment: { graph: 'tasks', description: 'Remove an attachment' },
  // Skills
  create_skill: { graph: 'skills', description: 'Create a skill with steps, triggers, and metadata' },
  update_skill: { graph: 'skills', description: 'Update any skill fields' },
  delete_skill: { graph: 'skills', description: 'Delete a skill and all its relations' },
  get_skill: { graph: 'skills', description: 'Fetch skill with relations and cross-links' },
  list_skills: { graph: 'skills', description: 'List skills with filters' },
  search_skills: { graph: 'skills', description: 'Hybrid search over skills' },
  recall_skills: { graph: 'skills', description: 'Recall relevant skills for a task context' },
  bump_skill_usage: { graph: 'skills', description: 'Increment usage counter' },
  link_skill: { graph: 'skills', description: 'Create skill-to-skill relation' },
  create_skill_link: { graph: 'skills', description: 'Link skill to another graph node' },
  delete_skill_link: { graph: 'skills', description: 'Remove a cross-graph link' },
  find_linked_skills: { graph: 'skills', description: 'Find skills linked to a target node' },
  add_skill_attachment: { graph: 'skills', description: 'Attach a file to a skill' },
  remove_skill_attachment: { graph: 'skills', description: 'Remove an attachment' },
};
