import { WebSocketServer, WebSocket } from 'ws';
import type http from 'http';
import type { ProjectManager } from '@/lib/project-manager';
import type { UserConfig } from '@/lib/multi-config';
import { verifyToken } from '@/lib/jwt';

export interface WebSocketOptions {
  jwtSecret?: string;
  users?: Record<string, UserConfig>;
}

export interface WebSocketHandle {
  wss: WebSocketServer;
  cleanup: () => void;
}

/**
 * Attach a WebSocket server to the HTTP server at /api/ws.
 * Broadcasts all ProjectManager events to connected clients.
 * Each event includes projectId — clients filter on their side.
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

  // Handle upgrade requests for /api/ws
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/api/ws') {
      socket.destroy();
      return;
    }

    // Auth: if users are configured, require valid JWT cookie or reject
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
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', (err) => {
        process.stderr.write(`[ws] Client error: ${err}\n`);
      });
      wss.emit('connection', ws, req);
    });
  });

  // Broadcast helper
  function broadcast(event: { projectId: string; type: string; data: any }): void {
    const msg = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg, (err) => {
          if (err) process.stderr.write(`[ws] Send error: ${err}\n`);
        });
      }
    }
  }

  // Subscribe to ProjectManager events (track handlers for cleanup)
  const listeners: Array<[string, (...args: any[]) => void]> = [];

  const events = [
    'note:created', 'note:updated', 'note:deleted',
    'note:attachment:added', 'note:attachment:deleted',
    'task:created', 'task:updated', 'task:deleted', 'task:moved',
    'task:attachment:added', 'task:attachment:deleted',
    'skill:created', 'skill:updated', 'skill:deleted',
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
      }, 1000);
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
