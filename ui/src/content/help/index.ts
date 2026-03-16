import gettingStarted from './getting-started.md?raw';
import howSearchWorks from './concepts/how-search-works.md?raw';
import graphStructure from './concepts/graph-structure.md?raw';
import crossGraph from './concepts/cross-graph.md?raw';
import docsTools from './guides/docs-tools.md?raw';
import codeTools from './guides/code-tools.md?raw';
import knowledgeTools from './guides/knowledge-tools.md?raw';
import taskTools from './guides/task-tools.md?raw';
import skillTools from './guides/skill-tools.md?raw';
import filesTools from './guides/files-tools.md?raw';
import crossReferences from './guides/cross-references.md?raw';

export interface HelpArticle {
  id: string;
  title: string;
  summary: string;
  category: 'overview' | 'concept' | 'guide';
  relatedTools: string[];
  content: string;
}

export const helpArticles: HelpArticle[] = [
  // Overview
  {
    id: 'getting-started',
    title: 'Getting Started',
    summary: 'What Graph Memory does, how the six graphs work, and how to get started.',
    category: 'overview',
    relatedTools: [],
    content: gettingStarted,
  },

  // Concepts
  {
    id: 'how-search-works',
    title: 'How Semantic Search Works',
    summary: 'Vector embeddings, cosine similarity, and BFS graph expansion explained.',
    category: 'concept',
    relatedTools: ['search', 'search_code', 'search_notes', 'search_tasks', 'search_skills', 'search_all_files', 'search_topic_files', 'search_files', 'search_snippets'],
    content: howSearchWorks,
  },
  {
    id: 'graph-structure',
    title: 'Graph Structure',
    summary: 'The six graphs: DocGraph, CodeGraph, FileIndexGraph, KnowledgeGraph, TaskGraph, SkillGraph.',
    category: 'concept',
    relatedTools: ['list_topics', 'get_toc', 'get_node', 'list_files', 'get_file_symbols', 'get_symbol', 'list_all_files', 'get_file_info', 'list_notes', 'get_note', 'list_tasks', 'get_task', 'list_skills', 'get_skill'],
    content: graphStructure,
  },
  {
    id: 'cross-graph',
    title: 'Cross-Graph Links',
    summary: 'How to link notes and tasks to code, docs, and files via proxy nodes.',
    category: 'concept',
    relatedTools: ['create_relation', 'delete_relation', 'list_relations', 'create_task_link', 'delete_task_link', 'create_skill_link', 'delete_skill_link', 'find_linked_notes', 'find_linked_tasks', 'find_linked_skills'],
    content: crossGraph,
  },

  // Guides
  {
    id: 'docs-tools',
    title: 'Documentation Tools',
    summary: 'Search, browse, and navigate indexed markdown documentation.',
    category: 'guide',
    relatedTools: [
      'list_topics', 'get_toc', 'search', 'get_node', 'search_topic_files',
      'find_examples', 'search_snippets', 'list_snippets', 'explain_symbol',
    ],
    content: docsTools,
  },
  {
    id: 'code-tools',
    title: 'Code Tools',
    summary: 'Search and navigate TypeScript/JavaScript source code symbols.',
    category: 'guide',
    relatedTools: ['list_files', 'get_file_symbols', 'search_code', 'get_symbol', 'search_files'],
    content: codeTools,
  },
  {
    id: 'knowledge-tools',
    title: 'Knowledge Tools',
    summary: 'Create and manage notes, facts, and decisions in a persistent knowledge graph.',
    category: 'guide',
    relatedTools: [
      'create_note', 'update_note', 'delete_note', 'get_note', 'list_notes',
      'search_notes', 'create_relation', 'delete_relation', 'list_relations', 'find_linked_notes',
      'add_note_attachment', 'remove_note_attachment',
    ],
    content: knowledgeTools,
  },
  {
    id: 'task-tools',
    title: 'Task Tools',
    summary: 'Kanban task management with priorities, dependencies, and cross-graph links.',
    category: 'guide',
    relatedTools: [
      'create_task', 'update_task', 'delete_task', 'get_task', 'list_tasks',
      'search_tasks', 'move_task', 'link_task', 'create_task_link', 'delete_task_link', 'find_linked_tasks',
      'add_task_attachment', 'remove_task_attachment',
    ],
    content: taskTools,
  },
  {
    id: 'skill-tools',
    title: 'Skill Tools',
    summary: 'Create and manage reusable skills, recipes, and procedures with triggers and usage tracking.',
    category: 'guide',
    relatedTools: [
      'create_skill', 'update_skill', 'delete_skill', 'get_skill', 'list_skills',
      'search_skills', 'link_skill', 'create_skill_link', 'delete_skill_link', 'find_linked_skills',
      'add_skill_attachment', 'remove_skill_attachment', 'recall_skills', 'bump_skill_usage',
    ],
    content: skillTools,
  },
  {
    id: 'files-tools',
    title: 'File Index Tools',
    summary: 'Browse and search metadata for every file and directory in your project.',
    category: 'guide',
    relatedTools: ['list_all_files', 'search_all_files', 'get_file_info'],
    content: filesTools,
  },
  {
    id: 'cross-references',
    title: 'Cross References Tool',
    summary: 'Bridge code definitions and documentation examples for any symbol.',
    category: 'guide',
    relatedTools: ['cross_references'],
    content: crossReferences,
  },
];

export function getArticle(id: string): HelpArticle | undefined {
  return helpArticles.find(a => a.id === id);
}

export function getArticlesForTool(toolName: string): HelpArticle[] {
  return helpArticles.filter(a => a.relatedTools.includes(toolName));
}
