import http from 'http';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { embed } from '@/lib/embedder';
import type { ProjectManager } from '@/lib/project-manager';
import type { PromiseQueue } from '@/lib/promise-queue';
import { createRestApp } from '@/api/rest/index';
import { attachWebSocket } from '@/api/rest/websocket';
import { resolveUserFromApiKey, resolveAccess, canWrite, canRead } from '@/lib/access';
import { MAX_BODY_SIZE, SESSION_SWEEP_INTERVAL_MS } from '@/lib/defaults';
import { GRAPH_NAMES, type GraphName, type AccessLevel } from '@/lib/multi-config';
import type { DocGraph } from '@/graphs/docs';
import { DocGraphManager } from '@/graphs/docs';
import type { CodeGraph } from '@/graphs/code-types';
import { CodeGraphManager } from '@/graphs/code';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import { KnowledgeGraphManager } from '@/graphs/knowledge';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import { FileIndexGraphManager } from '@/graphs/file-index';
import type { TaskGraph } from '@/graphs/task-types';
import { TaskGraphManager } from '@/graphs/task';
import type { SkillGraph } from '@/graphs/skill-types';
import { SkillGraphManager } from '@/graphs/skill';
import { noopContext, type ExternalGraphs } from '@/graphs/manager-types';
import * as listTopics from '@/api/tools/docs/list-topics';
import * as getToc from '@/api/tools/docs/get-toc';
import * as search from '@/api/tools/docs/search';
import * as getNode from '@/api/tools/docs/get-node';
import * as searchDocFiles from '@/api/tools/docs/search-files';
import * as findExamples from '@/api/tools/docs/find-examples';
import * as searchSnippets from '@/api/tools/docs/search-snippets';
import * as listSnippets from '@/api/tools/docs/list-snippets';
import * as explainSymbol from '@/api/tools/docs/explain-symbol';
import * as crossReferences from '@/api/tools/docs/cross-references';
import * as listFiles from '@/api/tools/code/list-files';
import * as getFileSymbols from '@/api/tools/code/get-file-symbols';
import * as searchCode from '@/api/tools/code/search-code';
import * as getSymbol from '@/api/tools/code/get-symbol';
import * as searchCodeFiles from '@/api/tools/code/search-files';
import * as createNote from '@/api/tools/knowledge/create-note';
import * as updateNote from '@/api/tools/knowledge/update-note';
import * as deleteNote from '@/api/tools/knowledge/delete-note';
import * as getNote from '@/api/tools/knowledge/get-note';
import * as listNotes from '@/api/tools/knowledge/list-notes';
import * as searchNotes from '@/api/tools/knowledge/search-notes';
import * as createRelation from '@/api/tools/knowledge/create-relation';
import * as deleteRelation from '@/api/tools/knowledge/delete-relation';
import * as listRelations from '@/api/tools/knowledge/list-relations';
import * as findLinkedNotes from '@/api/tools/knowledge/find-linked-notes';
import * as addNoteAttachment from '@/api/tools/knowledge/add-attachment';
import * as removeNoteAttachment from '@/api/tools/knowledge/remove-attachment';
import * as listAllFiles from '@/api/tools/file-index/list-all-files';
import * as searchAllFiles from '@/api/tools/file-index/search-all-files';
import * as getFileInfo from '@/api/tools/file-index/get-file-info';
import * as createTask from '@/api/tools/tasks/create-task';
import * as updateTask from '@/api/tools/tasks/update-task';
import * as deleteTask from '@/api/tools/tasks/delete-task';
import * as getTask from '@/api/tools/tasks/get-task';
import * as listTasksTool from '@/api/tools/tasks/list-tasks';
import * as searchTasksTool from '@/api/tools/tasks/search-tasks';
import * as moveTask from '@/api/tools/tasks/move-task';
import * as linkTask from '@/api/tools/tasks/link-task';
import * as createTaskLink from '@/api/tools/tasks/create-task-link';
import * as deleteTaskLink from '@/api/tools/tasks/delete-task-link';
import * as findLinkedTasks from '@/api/tools/tasks/find-linked-tasks';
import * as addTaskAttachment from '@/api/tools/tasks/add-attachment';
import * as removeTaskAttachment from '@/api/tools/tasks/remove-attachment';
import * as createSkillTool from '@/api/tools/skills/create-skill';
import * as updateSkillTool from '@/api/tools/skills/update-skill';
import * as deleteSkillTool from '@/api/tools/skills/delete-skill';
import * as getSkillTool from '@/api/tools/skills/get-skill';
import * as listSkillsTool from '@/api/tools/skills/list-skills';
import * as searchSkillsTool from '@/api/tools/skills/search-skills';
import * as linkSkill from '@/api/tools/skills/link-skill';
import * as createSkillLink from '@/api/tools/skills/create-skill-link';
import * as deleteSkillLink from '@/api/tools/skills/delete-skill-link';
import * as findLinkedSkills from '@/api/tools/skills/find-linked-skills';
import * as addSkillAttachment from '@/api/tools/skills/add-attachment';
import * as removeSkillAttachment from '@/api/tools/skills/remove-attachment';
import * as recallSkills from '@/api/tools/skills/recall-skills';
import * as bumpSkillUsage from '@/api/tools/skills/bump-usage';
import * as getContext from '@/api/tools/context/get-context';

import type { EmbedFn, EmbedFns } from '@/graphs/manager-types';

export type { EmbedFn, EmbedFns };

export interface McpSessionContext {
  projectId: string;
  workspaceId?: string;
  workspaceProjects?: string[];
  userId?: string;
}

export type EmbedFnMap = {
  docs: EmbedFns;
  code: EmbedFns;
  knowledge: EmbedFns;
  tasks: EmbedFns;
  files: EmbedFns;
  skills: EmbedFns;
};

/** Module-level debug flag — set via setDebugMode() from CLI --debug */
let _debugMode = false;
export function setDebugMode(enabled: boolean): void { _debugMode = enabled; }

/**
 * Create an McpServer proxy that logs every tool call and response to stderr.
 */
function createDebugServer(server: McpServer, getSessionId: () => string | undefined): McpServer {
  const proxy = Object.create(server) as McpServer;
  const origRegister = server.registerTool.bind(server);
  (proxy as any).registerTool = function(name: any, config: any, handler: any) {
    if (typeof handler === 'function') {
      const wrapped = async (...handlerArgs: any[]) => {
        const args = handlerArgs[0];
        const sid = getSessionId() ?? '?';
        process.stderr.write(`[debug] [${sid}] → ${name}(${JSON.stringify(args)})\n`);
        const start = Date.now();
        try {
          const result = await handler(...handlerArgs);
          const ms = Date.now() - start;
          const text = result?.content?.[0]?.text;
          const preview = text != null ? (text.length > 500 ? text.slice(0, 500) + '…' : text) : JSON.stringify(result).slice(0, 500);
          process.stderr.write(`[debug] [${sid}] ← ${name} (${ms}ms): ${preview}\n`);
          return result;
        } catch (err) {
          const ms = Date.now() - start;
          process.stderr.write(`[debug] [${sid}] ✗ ${name} (${ms}ms): ${err}\n`);
          throw err;
        }
      };
      return (origRegister as any)(name, config, wrapped);
    }
    return (origRegister as any)(name, config, handler);
  };
  return proxy;
}

/**
 * Create an McpServer proxy that wraps registerTool handlers in a PromiseQueue.
 * Used for mutation tools to prevent concurrent graph modifications.
 */
function createMutationServer(server: McpServer, queue: PromiseQueue): McpServer {
  const proxy = Object.create(server) as McpServer;
  const origRegister = server.registerTool.bind(server);
  (proxy as any).registerTool = function(name: any, config: any, handler: any) {
    if (typeof handler === 'function') {
      const wrapped = (...handlerArgs: any[]) => queue.enqueue(() => handler(...handlerArgs)) as any;
      return (origRegister as any)(name, config, wrapped);
    }
    return (origRegister as any)(name, config, handler);
  };
  return proxy;
}

function buildInstructions(ctx: McpSessionContext): string {
  const lines: string[] = [];
  if (ctx.workspaceId) {
    lines.push(`Connected to project "${ctx.projectId}" in workspace "${ctx.workspaceId}".`);
    if (ctx.workspaceProjects?.length) {
      lines.push(`Workspace projects: ${ctx.workspaceProjects.join(', ')}.`);
    }
    lines.push('Knowledge, tasks, and skills are shared across all workspace projects.');
    lines.push('Docs, code, and files are specific to the current project.');
    lines.push('Use projectId parameter in cross-graph links to reference nodes from other projects.');
  } else {
    lines.push(`Connected to project "${ctx.projectId}".`);
  }
  lines.push('Use get_context tool for structured project/workspace information.');
  return lines.join(' ');
}

/**
 * Creates the McpServer with all tools wired to the given graphs.
 * Pass docGraph to enable the 9 doc tools (5 base + 4 code-block) + 1 cross_references (needs codeGraph too);
 * pass codeGraph to enable the 5 code tools;
 * pass fileIndexGraph to enable the 3 file index tools.
 * cross_references requires both docGraph and codeGraph.
 * Knowledge tools (12) are always registered.
 * Task tools (13) are always registered when taskGraph is provided.
 * @param embedFn  Single EmbedFn (all graphs share it) or per-graph EmbedFnMap.
 *                 Tests typically pass a single function; CLI passes a map for per-graph models.
 * @param mutationQueue  Optional PromiseQueue to serialize mutation tool handlers.
 */
export function createMcpServer(
  docGraph?: DocGraph,
  codeGraph?: CodeGraph,
  knowledgeGraph?: KnowledgeGraph,
  fileIndexGraph?: FileIndexGraph,
  taskGraph?: TaskGraph,
  embedFn?: EmbedFn | Partial<EmbedFnMap>,
  mutationQueue?: PromiseQueue,
  projectDir?: string,
  skillGraph?: SkillGraph,
  sessionContext?: McpSessionContext,
  readonlyGraphs?: Set<string>,
  userAccess?: Map<string, AccessLevel>,
  getSessionId?: () => string | undefined,
): McpServer {
  // Backward-compat: single EmbedFn → use for both document and query
  const defaultPair: EmbedFns = { document: (q) => embed(q, ''), query: (q) => embed(q, '') };
  const fns: EmbedFnMap = typeof embedFn === 'function'
    ? {
        docs: { document: embedFn, query: embedFn },
        code: { document: embedFn, query: embedFn },
        knowledge: { document: embedFn, query: embedFn },
        tasks: { document: embedFn, query: embedFn },
        files: { document: embedFn, query: embedFn },
        skills: { document: embedFn, query: embedFn },
      }
    : {
        docs:      embedFn?.docs      ?? defaultPair,
        code:      embedFn?.code      ?? defaultPair,
        knowledge: embedFn?.knowledge ?? defaultPair,
        tasks:     embedFn?.tasks     ?? defaultPair,
        files:     embedFn?.files     ?? defaultPair,
        skills:    embedFn?.skills    ?? defaultPair,
      };

  // Build instructions for MCP clients (workspace/project context)
  const instructions = sessionContext ? buildInstructions(sessionContext) : undefined;
  const server = new McpServer(
    { name: 'graphmemory', version: '1.2.0' },
    instructions ? { instructions } : undefined,
  );
  // Debug logging wraps all tool handlers when --debug is active
  const debugServer = _debugMode && getSessionId ? createDebugServer(server, getSessionId) : server;
  // Mutation tools are registered through mutServer to serialize concurrent writes
  const mutServer = mutationQueue ? createMutationServer(debugServer, mutationQueue) : debugServer;

  // Check if mutation tools should be registered for a graph:
  // - graph must not be readonly (global setting — tools hidden for all)
  // - user must have write access (per-user — tools hidden for this user)
  // - if no userAccess map, all mutations are allowed (no auth configured)
  const canMutate = (graphName: string): boolean => {
    if (readonlyGraphs?.has(graphName)) return false;
    if (userAccess) {
      const level = userAccess.get(graphName);
      if (level && !canWrite(level)) return false;
    }
    return true;
  };

  // Check if a graph's tools should be registered at all (deny = no tools)
  const canAccess = (graphName: string): boolean => {
    if (!userAccess) return true;
    const level = userAccess.get(graphName);
    if (level && !canRead(level)) return false;
    return true;
  };

  // Context tool (always registered)
  getContext.register(server, sessionContext);

  const ext: ExternalGraphs = { docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, skillGraph };

  // Docs tools (only when docGraph is provided and user has access)
  if (docGraph && canAccess('docs')) {
    const docMgr = new DocGraphManager(docGraph, fns.docs, ext);
    listTopics.register(server, docMgr);
    getToc.register(server, docMgr);
    search.register(server, docMgr);
    getNode.register(server, docMgr);
    searchDocFiles.register(server, docMgr);
    findExamples.register(server, docMgr);
    searchSnippets.register(server, docMgr);
    listSnippets.register(server, docMgr);
    explainSymbol.register(server, docMgr);

    // Cross-graph tools (require both docGraph and codeGraph)
    if (codeGraph && canAccess('code')) {
      const codeMgrForCross = new CodeGraphManager(codeGraph, fns.code, ext);
      crossReferences.register(server, docMgr, codeMgrForCross);
    }
  }

  // Code tools (only when codeGraph is provided and user has access)
  if (codeGraph && canAccess('code')) {
    const codeMgr = new CodeGraphManager(codeGraph, fns.code, ext);
    listFiles.register(server, codeMgr);
    getFileSymbols.register(server, codeMgr);
    searchCode.register(server, codeMgr);
    getSymbol.register(server, codeMgr);
    searchCodeFiles.register(server, codeMgr);
  }

  // File index tools (when fileIndexGraph is provided and user has access)
  if (fileIndexGraph && canAccess('files')) {
    const fileIndexMgr = new FileIndexGraphManager(fileIndexGraph, fns.files, ext);
    listAllFiles.register(server, fileIndexMgr);
    searchAllFiles.register(server, fileIndexMgr);
    getFileInfo.register(server, fileIndexMgr);
  }

  // Knowledge tools — read tools gated by canAccess, mutation tools gated by canMutate
  if (knowledgeGraph && canAccess('knowledge')) {
    const ctx = projectDir ? { ...noopContext(), projectDir } : noopContext();
    const knowledgeMgr = new KnowledgeGraphManager(knowledgeGraph, fns.knowledge, ctx, {
      docGraph, codeGraph, fileIndexGraph, taskGraph, skillGraph,
    });
    getNote.register(server, knowledgeMgr);
    listNotes.register(server, knowledgeMgr);
    searchNotes.register(server, knowledgeMgr);
    listRelations.register(server, knowledgeMgr);
    findLinkedNotes.register(server, knowledgeMgr);
    if (canMutate('knowledge')) {
      createNote.register(mutServer, knowledgeMgr);
      updateNote.register(mutServer, knowledgeMgr);
      deleteNote.register(mutServer, knowledgeMgr);
      createRelation.register(mutServer, knowledgeMgr);
      deleteRelation.register(mutServer, knowledgeMgr);
      addNoteAttachment.register(mutServer, knowledgeMgr);
      removeNoteAttachment.register(mutServer, knowledgeMgr);
    }
  }

  // Task tools — read tools gated by canAccess, mutation tools gated by canMutate
  if (taskGraph && canAccess('tasks')) {
    const taskCtx = projectDir ? { ...noopContext(), projectDir } : noopContext();
    const taskMgr = new TaskGraphManager(taskGraph, fns.tasks, taskCtx, {
      docGraph, codeGraph, knowledgeGraph, fileIndexGraph, skillGraph,
    });
    getTask.register(server, taskMgr);
    listTasksTool.register(server, taskMgr);
    searchTasksTool.register(server, taskMgr);
    findLinkedTasks.register(server, taskMgr);
    if (canMutate('tasks')) {
      createTask.register(mutServer, taskMgr);
      updateTask.register(mutServer, taskMgr);
      deleteTask.register(mutServer, taskMgr);
      moveTask.register(mutServer, taskMgr);
      linkTask.register(mutServer, taskMgr);
      createTaskLink.register(mutServer, taskMgr);
      deleteTaskLink.register(mutServer, taskMgr);
      addTaskAttachment.register(mutServer, taskMgr);
      removeTaskAttachment.register(mutServer, taskMgr);
    }
  }

  // Skill tools — read tools gated by canAccess, mutation tools gated by canMutate
  if (skillGraph && canAccess('skills')) {
    const skillCtx = projectDir ? { ...noopContext(), projectDir } : noopContext();
    const skillMgr = new SkillGraphManager(skillGraph, fns.skills, skillCtx, {
      docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph,
    });
    getSkillTool.register(server, skillMgr);
    listSkillsTool.register(server, skillMgr);
    searchSkillsTool.register(server, skillMgr);
    findLinkedSkills.register(server, skillMgr);
    recallSkills.register(server, skillMgr);
    if (canMutate('skills')) {
      createSkillTool.register(mutServer, skillMgr);
      updateSkillTool.register(mutServer, skillMgr);
      deleteSkillTool.register(mutServer, skillMgr);
      linkSkill.register(mutServer, skillMgr);
      createSkillLink.register(mutServer, skillMgr);
      deleteSkillLink.register(mutServer, skillMgr);
      addSkillAttachment.register(mutServer, skillMgr);
      removeSkillAttachment.register(mutServer, skillMgr);
      bumpSkillUsage.register(mutServer, skillMgr);
    }
  }

  return server;
}

// ---------------------------------------------------------------------------
// HTTP transport (Streamable HTTP)
// ---------------------------------------------------------------------------


async function collectBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_SIZE) throw new Error('Request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

interface HttpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

export async function startHttpServer(
  host: string,
  port: number,
  sessionTimeoutMs: number,
  docGraph?: DocGraph,
  codeGraph?: CodeGraph,
  knowledgeGraph?: KnowledgeGraph,
  fileIndexGraph?: FileIndexGraph,
  taskGraph?: TaskGraph,
  embedFn?: EmbedFn | Partial<EmbedFnMap>,
  projectDir?: string,
  skillGraph?: SkillGraph,
  sessionContext?: McpSessionContext,
  readonlyGraphs?: Set<string>,
): Promise<http.Server> {
  const sessions = new Map<string, HttpSession>();

  // Sweep stale sessions every 60s
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, s] of sessions) {
      if (now - s.lastActivity > sessionTimeoutMs) {
        s.server.close().catch(() => {});
        sessions.delete(sid);
      }
    }
  }, SESSION_SWEEP_INTERVAL_MS);
  sweepInterval.unref();

  const httpServer = http.createServer(async (req, res) => {
    try {
      if (req.url !== '/mcp') {
        res.writeHead(404).end();
        return;
      }

      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      // Existing session — route to its transport
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        session.lastActivity = Date.now();
        const body = req.method === 'POST' ? await collectBody(req) : undefined;
        await session.transport.handleRequest(req, res, body);
        return;
      }

      // Stale/unknown session ID — return 404 per MCP spec so client can re-initialize
      if (sessionId) {
        res.writeHead(404, { 'content-type': 'application/json' }).end(
          JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }),
        );
        return;
      }

      // New session — only POST (initialize) can create one
      if (req.method !== 'POST') {
        res.writeHead(400).end('No session');
        return;
      }

      const body = await collectBody(req);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { server: mcpServer, transport, lastActivity: Date.now() });
          process.stderr.write(`[http] Session ${sid} started\n`);
        },
      });
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
      };
      const mcpServer = createMcpServer(docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, embedFn, undefined, projectDir, skillGraph, sessionContext, readonlyGraphs, undefined, () => transport.sessionId);
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) res.writeHead(400).end(String(err));
    }
  });

  return new Promise((resolve) => {
    httpServer.listen(port, host, () => {
      process.stderr.write(`[server] MCP HTTP server listening on http://${host}:${port}/mcp\n`);
      resolve(httpServer);
    });
  });
}

// ---------------------------------------------------------------------------
// Multi-project HTTP transport
// ---------------------------------------------------------------------------

interface MultiProjectHttpSession {
  projectId: string;
  workspaceId?: string;
  userId?: string;
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

export async function startMultiProjectHttpServer(
  host: string,
  port: number,
  sessionTimeoutMs: number,
  projectManager: ProjectManager,
  restOptions?: import('@/api/rest/index').RestAppOptions,
): Promise<http.Server> {
  const sessions = new Map<string, MultiProjectHttpSession>();

  // Sweep stale sessions every 60s
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, s] of sessions) {
      if (now - s.lastActivity > sessionTimeoutMs) {
        s.server.close().catch(() => {});
        sessions.delete(sid);
      }
    }
  }, SESSION_SWEEP_INTERVAL_MS);
  sweepInterval.unref();

  // Express app handles /api/* routes
  const restApp = createRestApp(projectManager, restOptions);

  const httpServer = http.createServer(async (req, res) => {
    try {
    // Route /api/* to Express
    if (req.url?.startsWith('/api/')) {
      restApp(req, res);
      return;
    }

    // Route: /mcp/{workspaceId}/{projectId} or /mcp/{projectId}
    const wsMatch = req.url?.match(/^\/mcp\/([^/?]+)\/([^/?]+)/);
    const projMatch = !wsMatch ? req.url?.match(/^\/mcp\/([^/?]+)/) : null;

    if (!wsMatch && !projMatch) {
      // Everything else (UI static files, SPA fallback) goes through Express
      restApp(req, res);
      return;
    }

    // Resolve project and optional workspace from URL
    let projectId: string;
    let workspaceId: string | undefined;

    if (wsMatch) {
      const maybeWs = decodeURIComponent(wsMatch[1]);
      const maybeProjId = decodeURIComponent(wsMatch[2]);
      const ws = projectManager.getWorkspace(maybeWs);
      if (ws) {
        // Valid workspace route
        if (!ws.config.projects.includes(maybeProjId)) {
          res.writeHead(404).end(JSON.stringify({ error: `Project "${maybeProjId}" is not part of workspace "${maybeWs}"` }));
          return;
        }
        workspaceId = maybeWs;
        projectId = maybeProjId;
      } else {
        // Not a workspace — treat first segment as projectId (fallback)
        projectId = maybeWs;
      }
    } else {
      projectId = decodeURIComponent(projMatch![1]);
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Existing session — route to its transport
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      if (session.projectId !== projectId) {
        res.writeHead(400).end('Session belongs to a different project');
        return;
      }
      session.lastActivity = Date.now();
      const body = req.method === 'POST' ? await collectBody(req) : undefined;
      await session.transport.handleRequest(req, res, body);
      return;
    }

    // Stale/unknown session ID — return 404 per MCP spec so client can re-initialize
    if (sessionId) {
      res.writeHead(404, { 'content-type': 'application/json' }).end(
        JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }),
      );
      return;
    }

    // New session — only POST (initialize) can create one
    if (req.method !== 'POST') {
      res.writeHead(400).end('No session');
      return;
    }

    // Validate project exists
    const project = projectManager.getProject(projectId);
    if (!project) {
      res.writeHead(404).end(JSON.stringify({ error: `Project "${projectId}" not found` }));
      return;
    }

    // Auth: if users configured, require valid API key
    const users = restOptions?.users ?? {};
    const hasUsers = Object.keys(users).length > 0;
    let userId: string | undefined;

    if (hasUsers) {
      const auth = req.headers.authorization;
      if (!auth?.startsWith('Bearer ') || auth.length <= 7) {
        res.writeHead(401).end(JSON.stringify({ error: 'API key required' }));
        return;
      }
      const result = resolveUserFromApiKey(auth.slice(7), users);
      if (!result) {
        res.writeHead(401).end(JSON.stringify({ error: 'Invalid API key' }));
        return;
      }
      userId = result.userId;
    }

    // Build session context (auto-detect workspace if not in URL)
    const ws = workspaceId
      ? projectManager.getWorkspace(workspaceId)
      : projectManager.getProjectWorkspace(projectId);
    const sessionCtx: McpSessionContext = {
      projectId,
      workspaceId: ws?.id,
      workspaceProjects: ws?.config.projects,
      userId,
    };

    // Build readonly set from config + workspace overrides
    const mcpReadonlyGraphs = new Set<string>();
    for (const gn of GRAPH_NAMES) {
      if (project.config.graphConfigs[gn].readonly) mcpReadonlyGraphs.add(gn);
    }
    if (project.workspaceId) {
      const wsInst = projectManager.getWorkspace(project.workspaceId);
      if (wsInst) {
        for (const gn of ['knowledge', 'tasks', 'skills'] as const) {
          if (wsInst.config.graphConfigs[gn].readonly) mcpReadonlyGraphs.add(gn);
        }
      }
    }

    // Build per-user access map
    let mcpUserAccess: Map<string, AccessLevel> | undefined;
    if (userId && restOptions?.serverConfig) {
      mcpUserAccess = new Map();
      for (const gn of GRAPH_NAMES) {
        const level = resolveAccess(userId, gn as GraphName, project.config, restOptions.serverConfig, ws?.config);
        mcpUserAccess.set(gn, level);
      }
    }

    const body = await collectBody(req);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, { projectId, workspaceId: ws?.id, userId, server: mcpServer, transport, lastActivity: Date.now() });
        process.stderr.write(`[http] Session ${sid} started (project: ${projectId}${ws ? `, workspace: ${ws.id}` : ''}${userId ? `, user: ${userId}` : ''})\n`);
      },
    });
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) sessions.delete(sid);
    };

    const mcpServer = createMcpServer(
      project.docGraph,
      project.codeGraph,
      project.knowledgeGraph,
      project.fileIndexGraph,
      project.taskGraph,
      project.embedFns,
      project.mutationQueue,
      project.config.projectDir,
      project.skillGraph,
      sessionCtx,
      mcpReadonlyGraphs,
      mcpUserAccess,
      () => transport.sessionId,
    );
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
    } catch (err) {
      if (!res.headersSent) res.writeHead(400).end(String(err));
    }
  });

  // Attach WebSocket server for real-time events
  attachWebSocket(httpServer, projectManager, {
    jwtSecret: restOptions?.serverConfig?.jwtSecret,
    users: restOptions?.users,
  });

  return new Promise((resolve) => {
    httpServer.listen(port, host, () => {
      const base = `http://${host}:${port}`;
      const projects = projectManager.listProjects();
      const workspaces = projectManager.listWorkspaces();

      const lines: string[] = [
        '',
        '  ╔══════════════════════════════════════════════╗',
        '  ║         Graph Memory Server Ready            ║',
        '  ╚══════════════════════════════════════════════╝',
        '',
        `  UI        ${base}/ui/`,
        `  REST API  ${base}/api/`,
        `  WebSocket ws://${host}:${port}/api/ws`,
        '',
        '  MCP endpoints:',
      ];

      for (const id of projects) {
        const ws = projectManager.getProjectWorkspace(id);
        const wsLabel = ws ? ` (${ws.id})` : '';
        lines.push(`    ${id}${wsLabel}  ${base}/mcp/${id}`);
      }

      if (projects.length === 0) {
        lines.push('    (no projects configured)');
      }

      if (workspaces.length > 0) {
        lines.push('');
        lines.push(`  Workspaces: ${workspaces.join(', ')}`);
      }

      lines.push('');
      process.stderr.write(lines.join('\n') + '\n');
      resolve(httpServer);
    });
  });
}
