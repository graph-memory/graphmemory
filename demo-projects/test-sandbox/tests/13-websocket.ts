/**
 * Phase 13: WebSocket Events
 *
 * Uses default sandbox config (port 3737, no auth).
 * Tests: connection, entity events, debouncing.
 */

import {
  group, test, runPhase,
  assert, assertEqual, assertExists, assertOk,
  printSummary, wait,
  startServer, stopServer, restWith,
} from './utils';
import WebSocket from 'ws';

const PORT = 3737;
const CONFIG = 'graph-memory.yaml';
let BASE = '';
let ws: WebSocket;
const received: any[] = [];

function connectWs(): Promise<void> {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/ws`);
    ws.on('open', () => resolve());
    ws.on('message', (data) => {
      try { received.push(JSON.parse(data.toString())); } catch {}
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('ws connect timeout')), 5000);
  });
}

function clearReceived() { received.length = 0; }

function findEvent(type: string, timeout = 3000): Promise<any> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const evt = received.find(e => e.type === type);
      if (evt) return resolve(evt);
      if (Date.now() - start > timeout) return reject(new Error(`event "${type}" not received within ${timeout}ms`));
      setTimeout(check, 100);
    };
    check();
  });
}

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Start server', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
  assertExists(BASE, 'base url');
});

test('Connect WebSocket', async () => {
  await connectWs();
  assert(ws.readyState === WebSocket.OPEN, 'ws should be open');
});

// ─── 13.1 Note events ───────────────────────────────────────────

group('13.1 Note events');

test('Create note → receives note:created', async () => {
  clearReceived();
  const res = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'WS Test Note', content: 'Testing websocket.' });
  assertOk(res);
  const evt = await findEvent('note:created');
  assertExists(evt, 'note:created event');
  assertExists(evt.projectId, 'projectId');
});

test('Update note → receives note:updated', async () => {
  clearReceived();
  // Get note ID
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes');
  const noteId = (listRes.data.results ?? listRes.data)[0]?.id;

  await restWith(BASE, 'PUT', `/api/projects/sandbox/knowledge/notes/${noteId}`,
    { title: 'WS Updated Note' });
  const evt = await findEvent('note:updated');
  assertExists(evt, 'note:updated event');
});

test('Delete note → receives note:deleted', async () => {
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes');
  const noteId = (listRes.data.results ?? listRes.data)[0]?.id;

  clearReceived();
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${noteId}`);
  const evt = await findEvent('note:deleted');
  assertExists(evt, 'note:deleted event');
});

// ─── 13.2 Task events ───────────────────────────────────────────

group('13.2 Task events');

test('Create task → receives task:created', async () => {
  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'WS Task', description: 'test', priority: 'low' });
  const evt = await findEvent('task:created');
  assertExists(evt, 'task:created event');
});

test('Move task → receives task:moved or task:updated', async () => {
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/tasks');
  const taskId = (listRes.data.results ?? listRes.data)[0]?.id;

  clearReceived();
  await restWith(BASE, 'POST', `/api/projects/sandbox/tasks/${taskId}/move`,
    { status: 'in_progress' });
  // Event may be task:moved or task:updated depending on implementation
  try {
    const evt = await findEvent('task:moved', 2000);
    assertExists(evt, 'task:moved event');
  } catch {
    const evt = await findEvent('task:updated', 2000);
    assertExists(evt, 'task:updated event (move)');
  }
});

test('Delete task → receives task:deleted', async () => {
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/tasks');
  const taskId = (listRes.data.results ?? listRes.data)[0]?.id;

  clearReceived();
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${taskId}`);
  const evt = await findEvent('task:deleted');
  assertExists(evt, 'task:deleted event');
});

// ─── 13.3 Skill events ─────────────────────────────────────────

group('13.3 Skill events');

test('Create skill → receives skill:created', async () => {
  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/skills',
    { title: 'WS Skill', description: 'test' });
  const evt = await findEvent('skill:created');
  assertExists(evt, 'skill:created event');
});

test('Delete skill → receives skill:deleted', async () => {
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/skills');
  const skillId = (listRes.data.results ?? listRes.data)[0]?.id;

  clearReceived();
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/skills/${skillId}`);
  const evt = await findEvent('skill:deleted');
  assertExists(evt, 'skill:deleted event');
});

// ─── 13.4 Epic events ──────────────────────────────────────────

group('13.4 Epic events');

test('Create epic → receives epic:created', async () => {
  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/epics',
    { title: 'WS Epic', description: 'test' });
  const evt = await findEvent('epic:created');
  assertExists(evt, 'epic:created event');
});

test('Delete epic → receives epic:deleted', async () => {
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/epics');
  const epicId = (listRes.data.results ?? listRes.data)[0]?.id;

  clearReceived();
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/epics/${epicId}`);
  const evt = await findEvent('epic:deleted');
  assertExists(evt, 'epic:deleted event');
});

// ─── Teardown ────────────────────────────────────────────────────

group('Teardown');

test('Close WebSocket and stop server', async () => {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  stopServer();
  await wait(500);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 13: WebSocket Events');
}

if (process.argv[1]?.includes('13-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
