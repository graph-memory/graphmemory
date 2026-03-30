import http from 'http';
import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { attachWebSocket, type WebSocketHandle } from '@/api/rest/websocket';
import { signAccessToken } from '@/lib/jwt';
import type { ProjectManager } from '@/lib/project-manager';
import type { ServerConfig } from '@/lib/multi-config';

function createMockProjectManager(): ProjectManager & EventEmitter {
  const em = new EventEmitter();
  // Minimal mock — only event emitter behavior needed
  (em as any).getProject = (id: string) => {
    if (id === 'test') return {
      config: {
        graphConfigs: {
          docs: { enabled: true }, code: { enabled: true },
          knowledge: { enabled: true }, files: { enabled: true },
          tasks: { enabled: true }, skills: { enabled: true },
        },
      },
      workspaceId: undefined,
    };
    return undefined;
  };
  (em as any).getWorkspace = () => undefined;
  return em as any;
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS open timeout')), 3000);
  });
}

function waitForMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    ws.on('message', (data) => resolve(JSON.parse(data.toString())));
    setTimeout(() => reject(new Error('WS message timeout')), 3000);
  });
}

describe('WebSocket server', () => {
  let server: http.Server;
  let wsHandle: WebSocketHandle;
  let pm: ProjectManager & EventEmitter;
  let port: number;

  beforeAll(async () => {
    pm = createMockProjectManager();
    server = http.createServer();
    wsHandle = attachWebSocket(server, pm);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Close all connected clients and WSS
    for (const client of wsHandle.wss.clients) {
      client.terminate();
    }
    wsHandle.cleanup();
    await new Promise<void>((resolve) => wsHandle.wss.close(() => resolve()));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('connects to /api/ws without auth', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('rejects non /api/ws paths', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/other`);
    await expect(waitForOpen(ws)).rejects.toThrow();
  });

  it('broadcasts note:created event', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
    await waitForOpen(ws);

    const msgPromise = waitForMessage(ws);
    pm.emit('note:created', { projectId: 'test', noteId: 'n1' });
    const msg = await msgPromise;

    expect(msg.type).toBe('note:created');
    expect(msg.projectId).toBe('test');
    expect(msg.data.noteId).toBe('n1');
    ws.close();
  });

  it('broadcasts task:moved event', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
    await waitForOpen(ws);

    const msgPromise = waitForMessage(ws);
    pm.emit('task:moved', { projectId: 'test', taskId: 't1', status: 'done' });
    const msg = await msgPromise;

    expect(msg.type).toBe('task:moved');
    expect(msg.data.taskId).toBe('t1');
    ws.close();
  });

  it('broadcasts relation events', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
    await waitForOpen(ws);

    const msgPromise = waitForMessage(ws);
    pm.emit('note:relation:added', { projectId: 'test', noteId: 'n1', toId: 'n2', kind: 'refs' });
    const msg = await msgPromise;

    expect(msg.type).toBe('note:relation:added');
    ws.close();
  });

  it('broadcasts skill events', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
    await waitForOpen(ws);

    const msgPromise = waitForMessage(ws);
    pm.emit('skill:created', { projectId: 'test', skillId: 's1' });
    const msg = await msgPromise;

    expect(msg.type).toBe('skill:created');
    ws.close();
  });

  it('cleanup removes listeners', () => {
    const pm2 = createMockProjectManager();
    const server2 = http.createServer();
    const handle = attachWebSocket(server2, pm2);
    expect(pm2.listenerCount('note:created')).toBeGreaterThan(0);
    handle.cleanup();
    expect(pm2.listenerCount('note:created')).toBe(0);
    server2.close();
  });

  it('debounces graph:updated events', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
    await waitForOpen(ws);

    const messages: any[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));

    // Emit multiple graph:updated rapidly
    pm.emit('graph:updated', { projectId: 'test', file: 'a.ts', graph: 'code' });
    pm.emit('graph:updated', { projectId: 'test', file: 'b.ts', graph: 'code' });

    // Wait for debounce (WS_DEBOUNCE_MS = 1000)
    await new Promise(r => setTimeout(r, 1500));

    // Should receive a single debounced message with both files
    const graphUpdates = messages.filter(m => m.type === 'graph:updated');
    expect(graphUpdates).toHaveLength(1);
    expect(graphUpdates[0].data.files).toContain('a.ts');
    expect(graphUpdates[0].data.files).toContain('b.ts');
    ws.close();
  });
});

// ---------------------------------------------------------------------------
// WebSocket with authentication
// ---------------------------------------------------------------------------

describe('WebSocket auth', () => {
  const JWT_SECRET = 'a'.repeat(32);
  const users = {
    alice: { name: 'Alice', email: 'alice@test.com', apiKey: 'key-alice' },
    bob: { name: 'Bob', email: 'bob@test.com', apiKey: 'key-bob' },
  };

  let server: http.Server;
  let wsHandle: WebSocketHandle;
  let pm: ProjectManager & EventEmitter;
  let port: number;

  beforeAll(async () => {
    pm = createMockProjectManager();
    // Add second project that bob can't access
    (pm as any).getProject = (id: string) => {
      if (id === 'test') return {
        config: {
          graphConfigs: {
            docs: { enabled: true }, code: { enabled: true },
            knowledge: { enabled: true, access: { alice: 'rw' } },
            files: { enabled: true }, tasks: { enabled: true }, skills: { enabled: true },
          },
          access: { alice: 'rw' },
        },
        workspaceId: undefined,
      };
      if (id === 'secret') return {
        config: {
          graphConfigs: {
            docs: { enabled: true, access: { alice: 'rw' } }, code: { enabled: true, access: { alice: 'rw' } },
            knowledge: { enabled: true, access: { alice: 'rw' } },
            files: { enabled: true, access: { alice: 'rw' } },
            tasks: { enabled: true, access: { alice: 'rw' } },
            skills: { enabled: true, access: { alice: 'rw' } },
          },
          access: { alice: 'rw' },
        },
        workspaceId: undefined,
      };
      return undefined;
    };

    server = http.createServer();
    wsHandle = attachWebSocket(server, pm, {
      jwtSecret: JWT_SECRET,
      users,
      serverConfig: { defaultAccess: 'deny', jwtSecret: JWT_SECRET } as ServerConfig,
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const client of wsHandle.wss.clients) client.terminate();
    wsHandle.cleanup();
    await new Promise<void>((resolve) => wsHandle.wss.close(() => resolve()));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects connection without cookie', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`);
    await expect(waitForOpen(ws)).rejects.toThrow();
  });

  it('rejects connection with invalid cookie', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`, {
      headers: { cookie: 'mgm_access=invalid-token' },
    });
    await expect(waitForOpen(ws)).rejects.toThrow();
  });

  it('accepts connection with valid JWT cookie', async () => {
    const token = signAccessToken('alice', JWT_SECRET, '15m');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`, {
      headers: { cookie: `mgm_access=${token}` },
    });
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('filters events by user access — alice sees test project', async () => {
    const token = signAccessToken('alice', JWT_SECRET, '15m');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`, {
      headers: { cookie: `mgm_access=${token}` },
    });
    await waitForOpen(ws);

    const msgPromise = waitForMessage(ws);
    pm.emit('note:created', { projectId: 'test', noteId: 'n1' });
    const msg = await msgPromise;
    expect(msg.type).toBe('note:created');
    ws.close();
  });

  it('filters events by user access — bob does not see secret project', async () => {
    const token = signAccessToken('bob', JWT_SECRET, '15m');
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/ws`, {
      headers: { cookie: `mgm_access=${token}` },
    });
    await waitForOpen(ws);

    const messages: any[] = [];
    ws.on('message', (data) => messages.push(JSON.parse(data.toString())));

    pm.emit('note:created', { projectId: 'secret', noteId: 'hidden' });

    // Wait briefly — bob should NOT receive the event
    await new Promise(r => setTimeout(r, 200));
    expect(messages.filter(m => m.projectId === 'secret')).toHaveLength(0);
    ws.close();
  });
});
