import { WebSocketServer, WebSocket } from 'ws';
import type http from 'http';
import type { ProjectManager } from '@/lib/project-manager';

/**
 * Attach a WebSocket server to the HTTP server at /api/ws.
 * Broadcasts all ProjectManager events to connected clients.
 * Each event includes projectId — clients filter on their side.
 */
export function attachWebSocket(httpServer: http.Server, projectManager: ProjectManager): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for /api/ws
  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/api/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  // Broadcast helper
  function broadcast(event: { projectId: string; type: string; data: any }): void {
    const msg = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  // Subscribe to ProjectManager events
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
    projectManager.on(eventType, (data: any) => {
      broadcast({ projectId: data.projectId, type: eventType, data });
    });
  }

  // Debounced graph:updated from indexer
  let graphUpdateTimer: ReturnType<typeof setTimeout> | undefined;
  let pendingGraphUpdates: Map<string, string[]> = new Map();

  projectManager.on('graph:updated', (data: { projectId: string; file: string; graph: string }) => {
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
  });

  return wss;
}
