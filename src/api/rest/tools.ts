import { Router } from 'express';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ProjectInstance, ProjectManager } from '@/lib/project-manager';
import { createMcpServer, type McpSessionContext } from '@/api/index';
import { GRAPH_NAMES, type GraphName } from '@/lib/multi-config';

// Tool category detection based on tool name
const TOOL_CATEGORIES: Record<string, string> = {
  get_context: 'context',
  docs_list_files: 'docs', docs_get_toc: 'docs', docs_search: 'docs', docs_get_node: 'docs',
  docs_search_files: 'docs', docs_find_examples: 'docs', docs_search_snippets: 'docs',
  docs_list_snippets: 'docs', docs_explain_symbol: 'docs', docs_cross_references: 'cross-graph',
  code_list_files: 'code', code_get_file_symbols: 'code', code_search: 'code',
  code_get_symbol: 'code', code_search_files: 'code',
  files_list: 'files', files_search: 'files', files_get_info: 'files',
  notes_create: 'knowledge', notes_update: 'knowledge', notes_delete: 'knowledge',
  notes_get: 'knowledge', notes_list: 'knowledge', notes_search: 'knowledge',
  notes_create_link: 'knowledge', notes_delete_link: 'knowledge',
  notes_list_links: 'knowledge', notes_find_linked: 'knowledge',
  notes_add_attachment: 'knowledge', notes_remove_attachment: 'knowledge',
  tasks_create: 'tasks', tasks_update: 'tasks', tasks_delete: 'tasks',
  tasks_get: 'tasks', tasks_list: 'tasks', tasks_search: 'tasks',
  tasks_move: 'tasks', tasks_link: 'tasks', tasks_create_link: 'tasks',
  tasks_delete_link: 'tasks', tasks_find_linked: 'tasks',
  tasks_add_attachment: 'tasks', tasks_remove_attachment: 'tasks',
  skills_create: 'skills', skills_update: 'skills', skills_delete: 'skills',
  skills_get: 'skills', skills_list: 'skills', skills_search: 'skills',
  skills_recall: 'skills', skills_bump_usage: 'skills',
  skills_link: 'skills', skills_create_link: 'skills', skills_delete_link: 'skills',
  skills_find_linked: 'skills',
  skills_add_attachment: 'skills', skills_remove_attachment: 'skills',
};

const MUTATION_SUFFIXES = ['_create', '_update', '_delete', '_move', '_link', '_create_link', '_delete_link', '_add_attachment', '_remove_attachment', '_bump_usage'];

function isMutationTool(toolName: string): boolean {
  return MUTATION_SUFFIXES.some(s => toolName.endsWith(s));
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
    projectDescription: p.config.description,
    workspaceId: ws?.id,
    workspaceProjects: ws?.config.projects,
  };

  // Build readonly set from config for defense-in-depth
  const readonlyGraphs = new Set<string>();
  for (const gn of GRAPH_NAMES) {
    if (p.config.graphConfigs[gn].readonly) readonlyGraphs.add(gn);
  }

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(
    p.embedFns, p.mutationQueue, sessionCtx,
    readonlyGraphs.size > 0 ? readonlyGraphs : undefined,
    undefined, undefined,
    p.storeManager,
    p.scopedStore,
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

  function getProject(req: Express.Request): ProjectInstance {
    return req.project!;
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
