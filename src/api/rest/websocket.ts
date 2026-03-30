import { WebSocketServer, WebSocket } from 'ws';
import type http from 'http';
import type { ProjectManager } from '@/lib/project-manager';
import type { UserConfig, ServerConfig } from '@/lib/multi-config';
import { verifyToken } from '@/lib/jwt';
import { resolveAccess, canRead } from '@/lib/access';
import { GRAPH_NAMES } from '@/lib/multi-config';
import { WS_DEBOUNCE_MS } from '@/lib/defaults';

export interface WebSocketOptions {
  jwtSecret?: string;
  users?: Record<string, UserConfig>;
  serverConfig?: ServerConfig;
}

export interface WebSocketHandle {
  wss: WebSocketServer;
  cleanup: () => void;
}

/**
 * Attach a WebSocket server to the HTTP server at /api/ws.
 * Broadcasts ProjectManager events to connected clients, filtered by user access.
 * Returns a handle with a cleanup function to remove all listeners.
 */
export function attachWebSocket(
  httpServer: http.Server,
  projectManager: ProjectManager,
  options?: WebSocketOptions,
): WebSocketHandle {
  const wss = new WebSocketServer({ noServer: true });
  const jwtSecret = options?.jwtSecret;
  const users = options?.users ?? {};
  const hasUsers = Object.keys(users).length > 0;
  const serverConfig = options?.serverConfig;

  // Store userId per WebSocket client
  const clientUserIds = new WeakMap<WebSocket, string | undefined>();

  // Handle upgrade requests for /api/ws
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/api/ws') {
      socket.destroy();
      return;
    }

    // Auth: if users are configured, require valid JWT cookie or reject
    let userId: string | undefined;
    if (hasUsers && jwtSecret) {
      const cookie = req.headers.cookie ?? '';
      const match = cookie.match(/(?:^|;\s*)mgm_access=([^;]+)/);
      const token = match?.[1];
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const payload = verifyToken(token, jwtSecret);
      if (!payload || payload.type !== 'access' || !users[payload.userId]) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      userId = payload.userId;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      clientUserIds.set(ws, userId);
      ws.on('error', (err) => {
        process.stderr.write(`[ws] Client error: ${err}\n`);
      });
      wss.emit('connection', ws, req);
    });
  });

  // Check if a user can access any graph in a project
  function canAccessProject(userId: string | undefined, projectId: string): boolean {
    if (!serverConfig || !hasUsers) return true;
    const project = projectManager.getProject(projectId);
    if (!project) return false;
    const ws = project.workspaceId ? projectManager.getWorkspace(project.workspaceId) : undefined;
    return GRAPH_NAMES.some(gn =>
      canRead(resolveAccess(userId, gn, project.config, serverConfig, ws?.config)),
    );
  }

  // Broadcast helper — filters by user access when auth is configured
  function broadcast(event: { projectId: string; type: string; data: any }): void {
    const msg = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (hasUsers && serverConfig) {
        const uid = clientUserIds.get(client);
        if (!canAccessProject(uid, event.projectId)) continue;
      }
      client.send(msg, (err) => {
        if (err) process.stderr.write(`[ws] Send error: ${err}\n`);
      });
    }
  }

  // Subscribe to ProjectManager events (track handlers for cleanup)
  const listeners: Array<[string, (...args: any[]) => void]> = [];

  const events = [
    'note:created', 'note:updated', 'note:deleted',
    'note:relation:added', 'note:relation:deleted',
    'note:attachment:added', 'note:attachment:deleted',
    'task:created', 'task:updated', 'task:deleted', 'task:moved', 'task:reordered',
    'task:relation:added', 'task:relation:deleted',
    'task:attachment:added', 'task:attachment:deleted',
    'epic:created', 'epic:updated', 'epic:deleted',
    'epic:linked', 'epic:unlinked',
    'skill:created', 'skill:updated', 'skill:deleted',
    'skill:relation:added', 'skill:relation:deleted',
    'skill:attachment:added', 'skill:attachment:deleted',
    'project:indexed',
  ];

  for (const eventType of events) {
    const handler = (data: any) => {
      broadcast({ projectId: data.projectId, type: eventType, data });
    };
    projectManager.on(eventType, handler);
    listeners.push([eventType, handler]);
  }

  // Debounced graph:updated from indexer
  let graphUpdateTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingGraphUpdates: Map<string, string[]> = new Map();

  const graphHandler = (data: { projectId: string; file: string; graph: string }) => {
    const key = data.projectId;
    if (!pendingGraphUpdates.has(key)) pendingGraphUpdates.set(key, []);
    pendingGraphUpdates.get(key)!.push(data.file);

    if (!graphUpdateTimer) {
      graphUpdateTimer = setTimeout(() => {
        for (const [projectId, files] of pendingGraphUpdates) {
          broadcast({ projectId, type: 'graph:updated', data: { files } });
        }
        pendingGraphUpdates = new Map();
        graphUpdateTimer = undefined;
      }, WS_DEBOUNCE_MS);
    }
  };
  projectManager.on('graph:updated', graphHandler);
  listeners.push(['graph:updated', graphHandler]);

  function cleanup(): void {
    for (const [event, handler] of listeners) {
      projectManager.removeListener(event, handler);
    }
    if (graphUpdateTimer) {
      clearTimeout(graphUpdateTimer);
      graphUpdateTimer = undefined;
    }
    pendingGraphUpdates.clear();
  }

  return { wss, cleanup };
}
