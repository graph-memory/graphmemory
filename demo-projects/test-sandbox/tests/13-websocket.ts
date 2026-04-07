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
  startServer, stopServer, restWith, uploadFile,
} from './utils';
import WebSocket from 'ws';

const PORT = 3737;
const CONFIG = 'tests/configs/sandbox.yaml';
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

test('Update skill → receives skill:updated', async () => {
  // Create a fresh skill so the update isn't ambiguous with stale list state
  const created = await restWith(BASE, 'POST', '/api/projects/sandbox/skills',
    { title: 'WS Skill Update Target', description: 'before' });
  assertOk(created);
  const skillId = created.data.id;

  clearReceived();
  await restWith(BASE, 'PUT', `/api/projects/sandbox/skills/${skillId}`,
    { title: 'WS Skill Updated', description: 'after' });
  const evt = await findEvent('skill:updated');
  assertExists(evt, 'skill:updated event');
  assertExists(evt.projectId, 'projectId on skill:updated');

  // Cleanup
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/skills/${skillId}`);
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

test('Update epic → receives epic:updated', async () => {
  const created = await restWith(BASE, 'POST', '/api/projects/sandbox/epics',
    { title: 'WS Epic Update Target', description: 'before' });
  assertOk(created);
  const epicId = created.data.id;

  clearReceived();
  await restWith(BASE, 'PUT', `/api/projects/sandbox/epics/${epicId}`,
    { title: 'WS Epic Updated', description: 'after' });
  const evt = await findEvent('epic:updated');
  assertExists(evt, 'epic:updated event');
  assertExists(evt.projectId, 'projectId on epic:updated');

  // Cleanup
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/epics/${epicId}`);
});

test('Delete epic → receives epic:deleted', async () => {
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/epics');
  const epicId = (listRes.data.results ?? listRes.data)[0]?.id;

  clearReceived();
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/epics/${epicId}`);
  const evt = await findEvent('epic:deleted');
  assertExists(evt, 'epic:deleted event');
});

// ─── 13.5 Relation events (note/task/skill) ─────────────────────

group('13.5 Relation events — note/task/skill');

test('Create note→note relation → receives note:relation:added', async () => {
  const n1 = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Rel A', content: 'a' });
  const n2 = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Rel B', content: 'b' });
  assertOk(n1); assertOk(n2);

  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/relations',
    { fromId: n1.data.id, toId: n2.data.id, kind: 'related_to' });
  const evt = await findEvent('note:relation:added');
  assertExists(evt, 'note:relation:added event');

  // Delete relation → note:relation:deleted
  clearReceived();
  await restWith(BASE, 'DELETE', '/api/projects/sandbox/knowledge/relations',
    { fromId: n1.data.id, toId: n2.data.id, kind: 'related_to' });
  const delEvt = await findEvent('note:relation:deleted');
  assertExists(delEvt, 'note:relation:deleted event');

  // Cleanup
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${n1.data.id}`);
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${n2.data.id}`);
});

test('Create task→note relation → receives task:relation:added', async () => {
  const note = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Task Rel Note', content: 'x' });
  const task = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Task Rel', description: '', priority: 'low' });
  assertOk(note); assertOk(task);

  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/tasks/links',
    { fromId: task.data.id, toId: note.data.id, kind: 'references', targetGraph: 'knowledge' });
  const evt = await findEvent('task:relation:added');
  assertExists(evt, 'task:relation:added event');

  clearReceived();
  await restWith(BASE, 'DELETE', '/api/projects/sandbox/tasks/links',
    { fromId: task.data.id, toId: note.data.id, kind: 'references', targetGraph: 'knowledge' });
  const delEvt = await findEvent('task:relation:deleted');
  assertExists(delEvt, 'task:relation:deleted event');

  // Cleanup
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${task.data.id}`);
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${note.data.id}`);
});

test('Create skill→skill relation → receives skill:relation:added', async () => {
  const s1 = await restWith(BASE, 'POST', '/api/projects/sandbox/skills',
    { title: 'Skill Rel A', description: 'a' });
  const s2 = await restWith(BASE, 'POST', '/api/projects/sandbox/skills',
    { title: 'Skill Rel B', description: 'b' });
  assertOk(s1); assertOk(s2);

  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/skills/links',
    { fromId: s1.data.id, toId: s2.data.id, kind: 'depends_on' });
  const evt = await findEvent('skill:relation:added');
  assertExists(evt, 'skill:relation:added event');

  clearReceived();
  await restWith(BASE, 'DELETE', '/api/projects/sandbox/skills/links',
    { fromId: s1.data.id, toId: s2.data.id, kind: 'depends_on' });
  const delEvt = await findEvent('skill:relation:deleted');
  assertExists(delEvt, 'skill:relation:deleted event');

  // Cleanup
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/skills/${s1.data.id}`);
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/skills/${s2.data.id}`);
});

// ─── 13.6 Attachment events ─────────────────────────────────────

group('13.6 Attachment events — add + delete');

test('Note attachment add+delete → receives note:attachment:added/deleted', async () => {
  const note = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Attach WS', content: 'test' });
  assertOk(note);
  const noteId = note.data.id;

  clearReceived();
  const upload = await uploadFile(
    `/knowledge/notes/${noteId}/attachments`, 'ws-attach.txt', 'hello', 'text/plain');
  assertOk(upload);
  const addEvt = await findEvent('note:attachment:added');
  assertExists(addEvt, 'note:attachment:added event');

  clearReceived();
  await restWith(BASE, 'DELETE',
    `/api/projects/sandbox/knowledge/notes/${noteId}/attachments/ws-attach.txt`);
  const delEvt = await findEvent('note:attachment:deleted');
  assertExists(delEvt, 'note:attachment:deleted event');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${noteId}`);
});

test('Task attachment add+delete → receives task:attachment:added/deleted', async () => {
  const task = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Attach Task', description: '', priority: 'low' });
  assertOk(task);
  const taskId = task.data.id;

  clearReceived();
  const upload = await uploadFile(
    `/tasks/${taskId}/attachments`, 'task-attach.txt', 'task content', 'text/plain');
  assertOk(upload);
  const addEvt = await findEvent('task:attachment:added');
  assertExists(addEvt, 'task:attachment:added event');

  clearReceived();
  await restWith(BASE, 'DELETE',
    `/api/projects/sandbox/tasks/${taskId}/attachments/task-attach.txt`);
  const delEvt = await findEvent('task:attachment:deleted');
  assertExists(delEvt, 'task:attachment:deleted event');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${taskId}`);
});

test('Skill attachment add+delete → receives skill:attachment:added/deleted', async () => {
  const skill = await restWith(BASE, 'POST', '/api/projects/sandbox/skills',
    { title: 'Attach Skill', description: 'x' });
  assertOk(skill);
  const skillId = skill.data.id;

  clearReceived();
  const upload = await uploadFile(
    `/skills/${skillId}/attachments`, 'skill-attach.txt', 'skill content', 'text/plain');
  assertOk(upload);
  const addEvt = await findEvent('skill:attachment:added');
  assertExists(addEvt, 'skill:attachment:added event');

  clearReceived();
  await restWith(BASE, 'DELETE',
    `/api/projects/sandbox/skills/${skillId}/attachments/skill-attach.txt`);
  const delEvt = await findEvent('skill:attachment:deleted');
  assertExists(delEvt, 'skill:attachment:deleted event');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/skills/${skillId}`);
});

// ─── 13.8 Task move/reorder events ──────────────────────────────

group('13.8 Task move/reorder events');

test('Move task → receives explicit task:moved event', async () => {
  const task = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Move Target', description: '', priority: 'low', status: 'todo' });
  assertOk(task);
  const taskId = task.data.id;

  clearReceived();
  await restWith(BASE, 'POST', `/api/projects/sandbox/tasks/${taskId}/move`,
    { status: 'in_progress' });
  const evt = await findEvent('task:moved');
  assertExists(evt, 'task:moved event');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${taskId}`);
});

test('Reorder task → receives explicit task:reordered event', async () => {
  const task = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Reorder Target', description: '', priority: 'low', status: 'todo' });
  assertOk(task);
  const taskId = task.data.id;

  clearReceived();
  await restWith(BASE, 'POST', `/api/projects/sandbox/tasks/${taskId}/reorder`,
    { order: 9999 });
  const evt = await findEvent('task:reordered');
  assertExists(evt, 'task:reordered event');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${taskId}`);
});

// ─── 13.9 Epic linking events ───────────────────────────────────

group('13.9 Epic linking events');

test('Link task to epic → receives epic:linked', async () => {
  const epic = await restWith(BASE, 'POST', '/api/projects/sandbox/epics',
    { title: 'Link Epic', description: '' });
  const task = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Link Task', description: '', priority: 'low' });
  assertOk(epic); assertOk(task);

  clearReceived();
  await restWith(BASE, 'POST', `/api/projects/sandbox/epics/${epic.data.id}/link`,
    { taskId: task.data.id });
  const evt = await findEvent('epic:linked');
  assertExists(evt, 'epic:linked event');

  clearReceived();
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/epics/${epic.data.id}/link`,
    { taskId: task.data.id });
  const unlinkEvt = await findEvent('epic:unlinked');
  assertExists(unlinkEvt, 'epic:unlinked event');

  // Cleanup
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${task.data.id}`);
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/epics/${epic.data.id}`);
});

// ─── 13.10 Task bulk events ─────────────────────────────────────

group('13.10 Task bulk operation events');

test('Bulk move tasks → receives task:bulk_moved', async () => {
  const t1 = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Bulk A', description: '', priority: 'low', status: 'todo' });
  const t2 = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Bulk B', description: '', priority: 'low', status: 'todo' });
  assertOk(t1); assertOk(t2);

  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/tasks/bulk/move',
    { taskIds: [t1.data.id, t2.data.id], status: 'done' });
  const evt = await findEvent('task:bulk_moved');
  assertExists(evt, 'task:bulk_moved event');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${t1.data.id}`);
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${t2.data.id}`);
});

test('Bulk priority tasks → receives task:bulk_priority', async () => {
  const t1 = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Bulk Pri A', description: '', priority: 'low' });
  const t2 = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Bulk Pri B', description: '', priority: 'low' });
  assertOk(t1); assertOk(t2);

  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/tasks/bulk/priority',
    { taskIds: [t1.data.id, t2.data.id], priority: 'critical' });
  const evt = await findEvent('task:bulk_priority');
  assertExists(evt, 'task:bulk_priority event');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${t1.data.id}`);
  await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${t2.data.id}`);
});

test('Bulk delete tasks → receives task:bulk_deleted', async () => {
  const t1 = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Bulk Del A', description: '', priority: 'low' });
  const t2 = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks',
    { title: 'Bulk Del B', description: '', priority: 'low' });
  assertOk(t1); assertOk(t2);

  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/tasks/bulk/delete',
    { taskIds: [t1.data.id, t2.data.id] });
  const evt = await findEvent('task:bulk_deleted');
  assertExists(evt, 'task:bulk_deleted event');
});

// ─── 13.11 Skill bumped event ───────────────────────────────────

group('13.11 Skill bumped event');

test('Bump skill usage → receives skill:bumped', async () => {
  const skill = await restWith(BASE, 'POST', '/api/projects/sandbox/skills',
    { title: 'Bump Target', description: 'x' });
  assertOk(skill);
  const skillId = skill.data.id;

  clearReceived();
  await restWith(BASE, 'POST', `/api/projects/sandbox/skills/${skillId}/bump`);
  const evt = await findEvent('skill:bumped');
  assertExists(evt, 'skill:bumped event');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/skills/${skillId}`);
});

// ─── 13.7 WebSocket reconnection ───────────────────────────────

group('13.7 WebSocket reconnection');

test('Reconnect after close — receives events', async () => {
  // Close current connection
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  await wait(500);

  // Reconnect
  await connectWs();
  assert(ws.readyState === WebSocket.OPEN, 'ws should reconnect');

  // Verify events still flow
  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Reconnect Test', content: 'test' });
  const evt = await findEvent('note:created');
  assertExists(evt, 'note:created after reconnect');

  // Cleanup
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes');
  for (const n of (listRes.data.results ?? listRes.data)) {
    if (n.title === 'Reconnect Test') {
      await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${n.id}`);
    }
  }
});

test('Multiple WS clients receive same event', async () => {
  const received2: any[] = [];
  const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/api/ws`);
  await new Promise<void>((resolve, reject) => {
    ws2.on('open', resolve);
    ws2.on('error', reject);
    setTimeout(() => reject(new Error('ws2 timeout')), 5000);
  });
  ws2.on('message', (data) => {
    try { received2.push(JSON.parse(data.toString())); } catch {}
  });

  clearReceived();
  await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes',
    { title: 'Multi WS Test', content: 'test' });

  // Both clients should receive the event
  const evt1 = await findEvent('note:created');
  assertExists(evt1, 'client 1 received');

  await wait(500);
  const evt2 = received2.find(e => e.type === 'note:created');
  assertExists(evt2, 'client 2 received');

  ws2.close();

  // Cleanup
  const listRes = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes');
  for (const n of (listRes.data.results ?? listRes.data)) {
    if (n.title === 'Multi WS Test') {
      await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${n.id}`);
    }
  }
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
