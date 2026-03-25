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
import mcpSetup from './guides/mcp-setup.md?raw';
import configuration from './guides/configuration.md?raw';

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
    summary: 'What Graph Memory does, how the graphs work, and how to get started.',
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
    relatedTools: ['docs_search', 'code_search', 'notes_search', 'tasks_search', 'skills_search', 'files_search', 'docs_search_files', 'code_search_files', 'docs_search_snippets'],
    content: howSearchWorks,
  },
  {
    id: 'graph-structure',
    title: 'Graph Structure',
    summary: 'The graphs: DocGraph, CodeGraph, FileIndexGraph, KnowledgeGraph, TaskGraph, SkillGraph.',
    category: 'concept',
    relatedTools: ['docs_list_files', 'docs_get_toc', 'docs_get_node', 'code_list_files', 'code_get_file_symbols', 'code_get_symbol', 'files_list', 'files_get_info', 'notes_list', 'notes_get', 'tasks_list', 'tasks_get', 'skills_list', 'skills_get'],
    content: graphStructure,
  },
  {
    id: 'cross-graph',
    title: 'Cross-Graph Links',
    summary: 'How to link notes and tasks to code, docs, and files via proxy nodes.',
    category: 'concept',
    relatedTools: ['notes_create_link', 'notes_delete_link', 'notes_list_links', 'tasks_create_link', 'tasks_delete_link', 'skills_create_link', 'skills_delete_link', 'notes_find_linked', 'tasks_find_linked', 'skills_find_linked'],
    content: crossGraph,
  },

  // Setup
  {
    id: 'mcp-setup',
    title: 'Connecting MCP Clients',
    summary: 'How to connect Claude Desktop, Cursor, Windsurf, and other MCP clients via HTTP.',
    category: 'guide',
    relatedTools: ['get_context'],
    content: mcpSetup,
  },
  {
    id: 'configuration',
    title: 'Configuration Guide',
    summary: 'All graph-memory.yaml settings: server, projects, workspaces, embedding models, and patterns.',
    category: 'guide',
    relatedTools: [],
    content: configuration,
  },

  // Guides
  {
    id: 'docs-tools',
    title: 'Documentation Tools',
    summary: 'Search, browse, and navigate indexed markdown documentation.',
    category: 'guide',
    relatedTools: [
      'docs_list_files', 'docs_get_toc', 'docs_search', 'docs_get_node', 'docs_search_files',
      'docs_find_examples', 'docs_search_snippets', 'docs_list_snippets', 'docs_explain_symbol',
    ],
    content: docsTools,
  },
  {
    id: 'code-tools',
    title: 'Code Tools',
    summary: 'Search and navigate TypeScript/JavaScript source code symbols.',
    category: 'guide',
    relatedTools: ['code_list_files', 'code_get_file_symbols', 'code_search', 'code_get_symbol', 'code_search_files'],
    content: codeTools,
  },
  {
    id: 'knowledge-tools',
    title: 'Knowledge Tools',
    summary: 'Create and manage notes, facts, and decisions in a persistent knowledge graph.',
    category: 'guide',
    relatedTools: [
      'notes_create', 'notes_update', 'notes_delete', 'notes_get', 'notes_list',
      'notes_search', 'notes_create_link', 'notes_delete_link', 'notes_list_links', 'notes_find_linked',
      'notes_add_attachment', 'notes_remove_attachment',
    ],
    content: knowledgeTools,
  },
  {
    id: 'task-tools',
    title: 'Task Tools',
    summary: 'Kanban task management with priorities, dependencies, and cross-graph links.',
    category: 'guide',
    relatedTools: [
      'tasks_create', 'tasks_update', 'tasks_delete', 'tasks_get', 'tasks_list',
      'tasks_search', 'tasks_move', 'tasks_link', 'tasks_create_link', 'tasks_delete_link', 'tasks_find_linked',
      'tasks_add_attachment', 'tasks_remove_attachment',
    ],
    content: taskTools,
  },
  {
    id: 'skill-tools',
    title: 'Skill Tools',
    summary: 'Create and manage reusable skills, recipes, and procedures with triggers and usage tracking.',
    category: 'guide',
    relatedTools: [
      'skills_create', 'skills_update', 'skills_delete', 'skills_get', 'skills_list',
      'skills_search', 'skills_link', 'skills_create_link', 'skills_delete_link', 'skills_find_linked',
      'skills_add_attachment', 'skills_remove_attachment', 'skills_recall', 'skills_bump_usage',
    ],
    content: skillTools,
  },
  {
    id: 'files-tools',
    title: 'File Index Tools',
    summary: 'Browse and search metadata for every file and directory in your project.',
    category: 'guide',
    relatedTools: ['files_list', 'files_search', 'files_get_info'],
    content: filesTools,
  },
  {
    id: 'cross-references',
    title: 'Cross References Tool',
    summary: 'Bridge code definitions and documentation examples for any symbol.',
    category: 'guide',
    relatedTools: ['docs_cross_references'],
    content: crossReferences,
  },
];

export function getArticle(id: string): HelpArticle | undefined {
  return helpArticles.find(a => a.id === id);
}

export function getArticlesForTool(toolName: string): HelpArticle[] {
  return helpArticles.filter(a => a.relatedTools.includes(toolName));
}
