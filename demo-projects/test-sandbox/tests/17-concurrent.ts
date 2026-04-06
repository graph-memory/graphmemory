/**
 * Phase 17: Concurrent Mutations
 *
 * Uses default sandbox config (port 3737).
 * Tests: parallel creates, parallel updates, mutation serialization.
 */

import {
  group, test, runPhase,
  assert, assertOk,
  printSummary, wait,
  startServer, stopServer, restWith,
} from './utils';

const PORT = 3737;
const CONFIG = 'graph-memory.yaml';
let BASE = '';

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Start server', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
});

// ─── 17.1 Parallel note creates ─────────────────────────────────

group('17.1 Parallel note creates');

test('10 concurrent note creates — all succeed', async () => {
  const promises = Array.from({ length: 10 }, (_, i) =>
    restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes', {
      title: `Concurrent Note ${i}`,
      content: `Created concurrently #${i}.`,
      tags: ['concurrent'],
    }),
  );
  const results = await Promise.all(promises);
  const ok = results.filter(r => r.ok);
  assert(ok.length === 10, `all 10 should succeed, got ${ok.length}`);

  // Verify all have unique IDs
  const ids = ok.map(r => r.data.id);
  const unique = new Set(ids);
  assert(unique.size === 10, 'all IDs should be unique');
});

test('All 10 notes listed', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes?tag=concurrent');
  assertOk(res);
  const notes = res.data.results ?? res.data;
  assert(notes.length === 10, `expected 10 notes, got ${notes.length}`);
});

// ─── 17.2 Parallel task creates ─────────────────────────────────

group('17.2 Parallel task creates');

test('10 concurrent task creates — all succeed', async () => {
  const promises = Array.from({ length: 10 }, (_, i) =>
    restWith(BASE, 'POST', '/api/projects/sandbox/tasks', {
      title: `Concurrent Task ${i}`,
      description: `Created concurrently #${i}.`,
      priority: 'low',
      tags: ['concurrent'],
    }),
  );
  const results = await Promise.all(promises);
  const ok = results.filter(r => r.ok);
  assert(ok.length === 10, `all 10 should succeed, got ${ok.length}`);
});

// ─── 17.3 Parallel updates to same entity ──────────────────────

group('17.3 Parallel updates to same entity');

test('5 concurrent updates to same note — no crash, last one wins', async () => {
  // Create a note
  const create = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes', {
    title: 'Race Target',
    content: 'Original.',
  });
  assertOk(create);
  const noteId = create.data.id;

  // Fire 5 concurrent updates
  const promises = Array.from({ length: 5 }, (_, i) =>
    restWith(BASE, 'PUT', `/api/projects/sandbox/knowledge/notes/${noteId}`, {
      content: `Update #${i}`,
    }),
  );
  const results = await Promise.all(promises);

  // All should succeed (serialized via PromiseQueue)
  const ok = results.filter(r => r.ok);
  assert(ok.length === 5, `all 5 updates should succeed, got ${ok.length}`);

  // Final state should be one of the updates
  const final = await restWith(BASE, 'GET', `/api/projects/sandbox/knowledge/notes/${noteId}`);
  assertOk(final);
  assert(final.data.content.startsWith('Update #'), 'content should be from an update');

  await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${noteId}`);
});

// ─── 17.4 Mixed concurrent operations ──────────────────────────

group('17.4 Mixed concurrent operations');

test('Create + search + list in parallel — no errors', async () => {
  const promises = [
    restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes', {
      title: 'Mixed Op Note', content: 'test',
    }),
    restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes'),
    restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/search?q=concurrent'),
    restWith(BASE, 'POST', '/api/projects/sandbox/tasks', {
      title: 'Mixed Op Task', description: 'test', priority: 'low',
    }),
    restWith(BASE, 'GET', '/api/projects/sandbox/tasks'),
  ];
  const results = await Promise.all(promises);
  const errors = results.filter(r => r.status >= 500);
  assert(errors.length === 0, `no 500 errors, got ${errors.length}`);
});

// ─── Cleanup ─────────────────────────────────────────────────────

group('Cleanup');

test('Delete test data', async () => {
  // Notes
  const notes = await restWith(BASE, 'GET', '/api/projects/sandbox/knowledge/notes');
  for (const n of (notes.data.results ?? notes.data)) {
    await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${n.id}`);
  }
  // Tasks
  const tasks = await restWith(BASE, 'GET', '/api/projects/sandbox/tasks');
  for (const t of (tasks.data.results ?? tasks.data)) {
    await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${t.id}`);
  }
});

// ─── Teardown ────────────────────────────────────────────────────

group('Teardown');

test('Stop server', async () => {
  stopServer();
  await wait(500);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 17: Concurrent Mutations');
}

if (process.argv[1]?.includes('17-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
