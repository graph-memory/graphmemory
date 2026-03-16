import http from 'http';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { embed } from '@/lib/embedder';
import type { ProjectManager } from '@/lib/project-manager';
import type { PromiseQueue } from '@/lib/promise-queue';
import { createRestApp } from '@/api/rest/index';
import { attachWebSocket } from '@/api/rest/websocket';
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

export type EmbedFn = (query: string) => Promise<number[]>;

export type EmbedFnMap = {
  docs: EmbedFn;
  code: EmbedFn;
  knowledge: EmbedFn;
  tasks: EmbedFn;
  files: EmbedFn;
  skills: EmbedFn;
};

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

/**
 * Creates the McpServer with all tools wired to the given graphs.
 * Pass docGraph to enable the 10 doc tools (5 base + 5 code-block tools);
 * pass codeGraph to enable the 5 code tools;
 * pass fileIndexGraph to enable the 3 file index tools.
 * cross_references requires both docGraph and codeGraph.
 * Knowledge tools (10) are always registered.
 * Task tools (11) are always registered when taskGraph is provided.
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
): McpServer {
  const defaultFn: EmbedFn = (q) => embed(q, '');
  const fns: EmbedFnMap = typeof embedFn === 'function'
    ? { docs: embedFn, code: embedFn, knowledge: embedFn, tasks: embedFn, files: embedFn, skills: embedFn }
    : {
        docs:      embedFn?.docs      ?? defaultFn,
        code:      embedFn?.code      ?? defaultFn,
        knowledge: embedFn?.knowledge ?? defaultFn,
        tasks:     embedFn?.tasks     ?? defaultFn,
        files:     embedFn?.files     ?? defaultFn,
        skills:    embedFn?.skills    ?? defaultFn,
      };

  const server = new McpServer({ name: 'mcp-graph-memory', version: '1.0.0' });
  // Mutation tools are registered through mutServer to serialize concurrent writes
  const mutServer = mutationQueue ? createMutationServer(server, mutationQueue) : server;

  const ext: ExternalGraphs = { docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, skillGraph };

  // Docs tools (only when docGraph is provided)
  if (docGraph) {
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
    if (codeGraph) {
      const codeMgrForCross = new CodeGraphManager(codeGraph, fns.code, ext);
      crossReferences.register(server, docMgr, codeMgrForCross);
    }
  }

  // Code tools (only when codeGraph is provided)
  if (codeGraph) {
    const codeMgr = new CodeGraphManager(codeGraph, fns.code, ext);
    listFiles.register(server, codeMgr);
    getFileSymbols.register(server, codeMgr);
    searchCode.register(server, codeMgr);
    getSymbol.register(server, codeMgr);
    searchCodeFiles.register(server, codeMgr);
  }

  // File index tools (always registered when fileIndexGraph is provided)
  if (fileIndexGraph) {
    const fileIndexMgr = new FileIndexGraphManager(fileIndexGraph, fns.files, ext);
    listAllFiles.register(server, fileIndexMgr);
    searchAllFiles.register(server, fileIndexMgr);
    getFileInfo.register(server, fileIndexMgr);
  }

  // Knowledge tools (always registered)
  // Mutations (create/update/delete) go through mutServer for queue serialization
  if (knowledgeGraph) {
    const ctx = projectDir ? { ...noopContext(), projectDir } : noopContext();
    const knowledgeMgr = new KnowledgeGraphManager(knowledgeGraph, fns.knowledge, ctx, {
      docGraph, codeGraph, fileIndexGraph, taskGraph,
    });
    createNote.register(mutServer, knowledgeMgr);
    updateNote.register(mutServer, knowledgeMgr);
    deleteNote.register(mutServer, knowledgeMgr);
    getNote.register(server, knowledgeMgr);
    listNotes.register(server, knowledgeMgr);
    searchNotes.register(server, knowledgeMgr);
    createRelation.register(mutServer, knowledgeMgr);
    deleteRelation.register(mutServer, knowledgeMgr);
    listRelations.register(server, knowledgeMgr);
    findLinkedNotes.register(server, knowledgeMgr);
    addNoteAttachment.register(mutServer, knowledgeMgr);
    removeNoteAttachment.register(mutServer, knowledgeMgr);
  }

  // Task tools (always registered when taskGraph is provided)
  // Mutations go through mutServer for queue serialization
  if (taskGraph) {
    const taskCtx = projectDir ? { ...noopContext(), projectDir } : noopContext();
    const taskMgr = new TaskGraphManager(taskGraph, fns.tasks, taskCtx, {
      docGraph, codeGraph, knowledgeGraph, fileIndexGraph,
    });
    createTask.register(mutServer, taskMgr);
    updateTask.register(mutServer, taskMgr);
    deleteTask.register(mutServer, taskMgr);
    getTask.register(server, taskMgr);
    listTasksTool.register(server, taskMgr);
    searchTasksTool.register(server, taskMgr);
    moveTask.register(mutServer, taskMgr);
    linkTask.register(mutServer, taskMgr);
    createTaskLink.register(mutServer, taskMgr);
    deleteTaskLink.register(mutServer, taskMgr);
    findLinkedTasks.register(server, taskMgr);
    addTaskAttachment.register(mutServer, taskMgr);
    removeTaskAttachment.register(mutServer, taskMgr);
  }

  // Skill tools (always registered when skillGraph is provided)
  if (skillGraph) {
    const skillCtx = projectDir ? { ...noopContext(), projectDir } : noopContext();
    const skillMgr = new SkillGraphManager(skillGraph, fns.skills, skillCtx, {
      docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph,
    });
    createSkillTool.register(mutServer, skillMgr);
    updateSkillTool.register(mutServer, skillMgr);
    deleteSkillTool.register(mutServer, skillMgr);
    getSkillTool.register(server, skillMgr);
    listSkillsTool.register(server, skillMgr);
    searchSkillsTool.register(server, skillMgr);
    linkSkill.register(mutServer, skillMgr);
    createSkillLink.register(mutServer, skillMgr);
    deleteSkillLink.register(mutServer, skillMgr);
    findLinkedSkills.register(server, skillMgr);
    addSkillAttachment.register(mutServer, skillMgr);
    removeSkillAttachment.register(mutServer, skillMgr);
    recallSkills.register(server, skillMgr);
    bumpSkillUsage.register(mutServer, skillMgr);
  }

  return server;
}

export async function startStdioServer(
  docGraph?: DocGraph,
  codeGraph?: CodeGraph,
  knowledgeGraph?: KnowledgeGraph,
  fileIndexGraph?: FileIndexGraph,
  taskGraph?: TaskGraph,
  embedFn?: EmbedFn | Partial<EmbedFnMap>,
  projectDir?: string,
  skillGraph?: SkillGraph,
): Promise<void> {
  const server = createMcpServer(docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, embedFn, undefined, projectDir, skillGraph);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[server] MCP server running on stdio\n');
}

// ---------------------------------------------------------------------------
// HTTP transport (Streamable HTTP)
// ---------------------------------------------------------------------------

async function collectBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
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
): Promise<http.Server> {
  const sessions = new Map<string, HttpSession>();

  // Sweep stale sessions every 60s
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, s] of sessions) {
      if (now - s.lastActivity > sessionTimeoutMs) {
        s.server.close().catch(() => {});
        sessions.delete(sid);
        process.stderr.write(`[http] Session ${sid} timed out\n`);
      }
    }
  }, 60_000);
  sweepInterval.unref();

  const httpServer = http.createServer(async (req, res) => {
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
    const mcpServer = createMcpServer(docGraph, codeGraph, knowledgeGraph, fileIndexGraph, taskGraph, embedFn);
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
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
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  lastActivity: number;
}

export async function startMultiProjectHttpServer(
  host: string,
  port: number,
  sessionTimeoutMs: number,
  projectManager: ProjectManager,
): Promise<http.Server> {
  const sessions = new Map<string, MultiProjectHttpSession>();

  // Sweep stale sessions every 60s
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [sid, s] of sessions) {
      if (now - s.lastActivity > sessionTimeoutMs) {
        s.server.close().catch(() => {});
        sessions.delete(sid);
        process.stderr.write(`[http] Session ${sid} (project: ${s.projectId}) timed out\n`);
      }
    }
  }, 60_000);
  sweepInterval.unref();

  // Express app handles /api/* routes
  const restApp = createRestApp(projectManager);

  const httpServer = http.createServer(async (req, res) => {
    // Route /api/* to Express
    if (req.url?.startsWith('/api/')) {
      restApp(req, res);
      return;
    }

    // Route: /mcp/{projectId}
    const mcpMatch = req.url?.match(/^\/mcp\/([^/?]+)/);
    if (!mcpMatch) {
      // Everything else (UI static files, SPA fallback) goes through Express
      restApp(req, res);
      return;
    }

    const projectId = decodeURIComponent(mcpMatch[1]);
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

    const body = await collectBody(req);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        sessions.set(sid, { projectId, server: mcpServer, transport, lastActivity: Date.now() });
        process.stderr.write(`[http] Session ${sid} started (project: ${projectId})\n`);
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
    );
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  // Attach WebSocket server for real-time events
  attachWebSocket(httpServer, projectManager);

  return new Promise((resolve) => {
    httpServer.listen(port, host, () => {
      process.stderr.write(`[server] Multi-project MCP HTTP server listening on http://${host}:${port}/mcp/{projectId}\n`);
      process.stderr.write(`[server] REST API at http://${host}:${port}/api/\n`);
      process.stderr.write(`[server] WebSocket at ws://${host}:${port}/api/ws\n`);
      resolve(httpServer);
    });
  });
}
