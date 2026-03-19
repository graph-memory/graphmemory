import { Router } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectInstance, ProjectManager } from '@/lib/project-manager';
import { createMcpServer, type McpSessionContext } from '@/api/index';
import type { GraphName } from '@/lib/multi-config';

// Tool category detection based on tool name
const TOOL_CATEGORIES: Record<string, string> = {
  get_context: 'context',
  list_topics: 'docs', get_toc: 'docs', search: 'docs', get_node: 'docs',
  search_topic_files: 'docs', find_examples: 'docs', search_snippets: 'docs',
  list_snippets: 'docs', explain_symbol: 'docs', cross_references: 'cross-graph',
  list_files: 'code', get_file_symbols: 'code', search_code: 'code',
  get_symbol: 'code', search_files: 'code',
  list_all_files: 'files', search_all_files: 'files', get_file_info: 'files',
  create_note: 'knowledge', update_note: 'knowledge', delete_note: 'knowledge',
  get_note: 'knowledge', list_notes: 'knowledge', search_notes: 'knowledge',
  create_relation: 'knowledge', delete_relation: 'knowledge',
  list_relations: 'knowledge', find_linked_notes: 'knowledge',
  add_note_attachment: 'knowledge', remove_note_attachment: 'knowledge',
  create_task: 'tasks', update_task: 'tasks', delete_task: 'tasks',
  get_task: 'tasks', list_tasks: 'tasks', search_tasks: 'tasks',
  move_task: 'tasks', link_task: 'tasks', create_task_link: 'tasks',
  delete_task_link: 'tasks', find_linked_tasks: 'tasks',
  add_task_attachment: 'tasks', remove_task_attachment: 'tasks',
  create_skill: 'skills', update_skill: 'skills', delete_skill: 'skills',
  get_skill: 'skills', list_skills: 'skills', search_skills: 'skills',
  recall_skills: 'skills', bump_skill_usage: 'skills',
  link_skill: 'skills', create_skill_link: 'skills', delete_skill_link: 'skills',
  find_linked_skills: 'skills',
  add_skill_attachment: 'skills', remove_skill_attachment: 'skills',
};

const MUTATION_PREFIXES = ['create_', 'update_', 'delete_', 'move_', 'link_', 'add_', 'remove_', 'bump_'];

function isMutationTool(toolName: string): boolean {
  return MUTATION_PREFIXES.some(p => toolName.startsWith(p));
}

export type ToolAccessChecker = (req: any, graphName: GraphName, level: 'r' | 'rw') => boolean;

/**
 * Get or create a lazy MCP client for a project instance.
 * The client is cached on the instance for reuse.
 */
async function getClient(p: ProjectInstance, pm: ProjectManager): Promise<Client> {
  if (p.mcpClient) return p.mcpClient;

  // Build session context for get_context tool
  const ws = p.workspaceId ? pm.getWorkspace(p.workspaceId) : undefined;
  const sessionCtx: McpSessionContext = {
    projectId: p.id,
    workspaceId: ws?.id,
    workspaceProjects: ws?.config.projects,
  };

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(
    p.docGraph, p.codeGraph, p.knowledgeGraph, p.fileIndexGraph,
    p.taskGraph, p.embedFns, p.mutationQueue,
    p.config.projectDir, p.skillGraph, sessionCtx,
  );
  await server.connect(serverTransport);

  const client = new Client({ name: 'tools-explorer', version: '1.0.0' });
  await client.connect(clientTransport);

  p.mcpClient = client;
  p.mcpClientCleanup = async () => {
    await client.close();
    p.mcpClient = undefined;
    p.mcpClientCleanup = undefined;
  };

  return client;
}

export function createToolsRouter(projectManager: ProjectManager, checkAccess?: ToolAccessChecker): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any): ProjectInstance {
    return req.project;
  }

  // List all available tools (filtered by access)
  router.get('/', async (req, res, next) => {
    try {
      const p = getProject(req);
      const client = await getClient(p, projectManager);
      const { tools } = await client.listTools();
      const results = tools
        .filter(t => {
          if (!checkAccess) return true;
          const cat = TOOL_CATEGORIES[t.name];
          if (!cat || cat === 'context' || cat === 'cross-graph') return true;
          return checkAccess(req, cat as GraphName, 'r');
        })
        .map(t => ({
          name: t.name,
          description: t.description || '',
          category: TOOL_CATEGORIES[t.name] || 'other',
          inputSchema: t.inputSchema,
        }));
      res.json({ results });
    } catch (err) { next(err); }
  });

  // Get single tool info
  router.get('/:toolName', async (req, res, next) => {
    try {
      const p = getProject(req);
      const client = await getClient(p, projectManager);
      const { tools } = await client.listTools();
      const tool = tools.find(t => t.name === req.params.toolName);
      if (!tool) return res.status(404).json({ error: `Tool "${req.params.toolName}" not found` });

      // Check read access for the tool's graph
      if (checkAccess) {
        const cat = TOOL_CATEGORIES[tool.name];
        if (cat && cat !== 'context' && cat !== 'cross-graph' && !checkAccess(req, cat as GraphName, 'r')) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      res.json({
        name: tool.name,
        description: tool.description || '',
        category: TOOL_CATEGORIES[tool.name] || 'other',
        inputSchema: tool.inputSchema,
      });
    } catch (err) { next(err); }
  });

  // Call a tool
  router.post('/:toolName/call', async (req, res, next) => {
    try {
      const p = getProject(req);
      const toolName = req.params.toolName;

      // Check access: read for queries, write for mutations
      if (checkAccess) {
        const cat = TOOL_CATEGORIES[toolName];
        if (cat && cat !== 'context' && cat !== 'cross-graph') {
          const level = isMutationTool(toolName) ? 'rw' : 'r';
          if (!checkAccess(req, cat as GraphName, level)) {
            return res.status(403).json({ error: level === 'rw' ? 'Read-only access' : 'Access denied' });
          }
        }
      }

      const client = await getClient(p, projectManager);
      const start = Date.now();
      const result = await client.callTool({
        name: toolName,
        arguments: req.body.arguments || {},
      });
      const duration = Date.now() - start;
      res.json({
        result: result.content,
        isError: result.isError || false,
        duration,
      });
    } catch (err) { next(err); }
  });

  return router;
}
