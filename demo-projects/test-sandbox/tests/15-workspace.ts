/**
 * Phase 15: Multi-project Workspace
 *
 * Uses workspace.yaml config (port 4141, 2 projects in shared workspace).
 * Tests: shared knowledge/tasks/skills across projects, separate docs/code.
 */

import {
  group, test, runPhase,
  assert, assertEqual, assertExists, assertOk, assertStatus,
  printSummary, wait,
  startServer, stopServer, restWith,
} from './utils';
import { rmSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const PORT = 4141;
const CONFIG = 'tests/configs/workspace.yaml';
let BASE = '';
const API_A = () => `${BASE}/api/projects/sandbox-a`;
const API_B = () => `${BASE}/api/projects/sandbox-b`;

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Clean workspace data', async () => {
  const wsDir = resolve(__dirname, '..', '.workspace-shared');
  if (existsSync(wsDir)) rmSync(wsDir, { recursive: true });
});

test('Start server with workspace config', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
  assertExists(BASE, 'base url');
});

// ─── 15.1 Both projects listed ──────────────────────────────────

group('15.1 Projects & workspaces');

test('GET /api/projects — lists both projects', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects');
  assertOk(res);
  const projects = res.data.results ?? res.data;
  assert(projects.length >= 2, `expected >= 2 projects, got ${projects.length}`);
  const ids = projects.map((p: any) => p.id);
  assert(ids.includes('sandbox-a'), 'should have sandbox-a');
  assert(ids.includes('sandbox-b'), 'should have sandbox-b');
});

test('GET /api/workspaces — lists workspace', async () => {
  const res = await restWith(BASE, 'GET', '/api/workspaces');
  assertOk(res);
  const workspaces = res.data.results ?? res.data;
  assert(Array.isArray(workspaces) && workspaces.length > 0, 'should have workspace');
});

// ─── 15.2 Docs/code are separate per project ───────────────────

group('15.2 Docs & code are per-project');

test('Project A has its own docs', async () => {
  const res = await restWith(BASE, 'GET', `${API_A()}/docs/topics`);
  assertOk(res);
  const docs = res.data.results ?? res.data;
  assert(docs.length > 0, 'project A should have docs');
});

test('Project B has its own docs', async () => {
  const res = await restWith(BASE, 'GET', `${API_B()}/docs/topics`);
  assertOk(res);
  const docs = res.data.results ?? res.data;
  assert(docs.length > 0, 'project B should have docs');
});

test('Project A code ≠ project B code', async () => {
  const resA = await restWith(BASE, 'GET', `${API_A()}/code/files`);
  const resB = await restWith(BASE, 'GET', `${API_B()}/code/files`);
  assertOk(resA);
  assertOk(resB);
  const filesA = (resA.data.results ?? resA.data).map((f: any) => f.fileId ?? f.id);
  const filesB = (resB.data.results ?? resB.data).map((f: any) => f.fileId ?? f.id);
  // They should have different files
  const overlap = filesA.filter((f: string) => filesB.includes(f));
  assertEqual(overlap.length, 0, 'docs/code should not overlap between projects');
});

// ─── 15.3 Knowledge is shared ───────────────────────────────────

group('15.3 Shared knowledge');

test('Create note via project A', async () => {
  const res = await restWith(BASE, 'POST', `${API_A()}/knowledge/notes`, {
    title: 'Shared Note from A',
    content: 'Created in project A, should be visible in B.',
    tags: ['workspace'],
  });
  // BUG: workspace DB may create vec tables with wrong dimensions before probing
  if (!res.ok && res.status === 500) {
    throw new Error(`SERVER BUG: workspace write failed (likely vec dimension mismatch) — ${JSON.stringify(res.data)}`);
  }
  assertOk(res);
  assertExists(res.data.id, 'noteId');
});

test('Note visible in project B', async () => {
  const res = await restWith(BASE, 'GET', `${API_B()}/knowledge/notes`);
  assertOk(res);
  const notes = res.data.results ?? res.data;
  assert(notes.some((n: any) => n.title === 'Shared Note from A'),
    'note from A should be visible in B');
});

test('Create note via project B', async () => {
  const res = await restWith(BASE, 'POST', `${API_B()}/knowledge/notes`, {
    title: 'Shared Note from B',
    content: 'Created in project B.',
  });
  assertOk(res);
});

test('Both notes visible in project A', async () => {
  const res = await restWith(BASE, 'GET', `${API_A()}/knowledge/notes`);
  assertOk(res);
  const notes = res.data.results ?? res.data;
  assert(notes.length >= 2, 'should see both notes');
});

// ─── 15.4 Tasks are shared ─────────────────────────────────────

group('15.4 Shared tasks');

test('Create task via project A', async () => {
  const res = await restWith(BASE, 'POST', `${API_A()}/tasks`, {
    title: 'Shared Task', description: 'From A.', priority: 'high',
  });
  assertOk(res);
});

test('Task visible in project B', async () => {
  const res = await restWith(BASE, 'GET', `${API_B()}/tasks`);
  assertOk(res);
  const tasks = res.data.results ?? res.data;
  assert(tasks.some((t: any) => t.title === 'Shared Task'),
    'task from A should be visible in B');
});

// ─── 15.5 Skills are shared ────────────────────────────────────

group('15.5 Shared skills');

test('Create skill via project A', async () => {
  const res = await restWith(BASE, 'POST', `${API_A()}/skills`, {
    title: 'Shared Skill', description: 'From A.',
  });
  assertOk(res);
});

test('Skill visible in project B', async () => {
  const res = await restWith(BASE, 'GET', `${API_B()}/skills`);
  assertOk(res);
  const skills = res.data.results ?? res.data;
  assert(skills.some((s: any) => s.title === 'Shared Skill'),
    'skill from A should be visible in B');
});

// ─── 15.6 Context shows workspace ──────────────────────────────

group('15.6 Context');

test('get_context for project A shows workspace', async () => {
  const res = await restWith(BASE, 'POST', `${API_A()}/tools/get_context/call`,
    { arguments: {} });
  assertOk(res);
  const content = res.data.result?.[0];
  const data = content?.type === 'text' ? JSON.parse(content.text) : content;
  assertEqual(data.hasWorkspace, true, 'hasWorkspace');
  assertExists(data.workspaceId, 'workspaceId');
});

// ─── 15.7 Search across shared graphs ───────────────────────────

group('15.7 Search across shared graphs');

test('Search notes from project B finds note created in A', async () => {
  await wait(500);
  const res = await restWith(BASE, 'GET', `${API_B()}/knowledge/search?q=Shared+Note`);
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find shared note via search from B');
});

// ─── 15.8 Per-project stats isolation ───────────────────────────

group('15.8 Per-project stats');

test('Stats for project A', async () => {
  const res = await restWith(BASE, 'GET', `${API_A()}/stats`);
  assertOk(res);
  assertExists(res.data.docs, 'docs stats');
  assertExists(res.data.code, 'code stats');
});

test('Stats for project B', async () => {
  const res = await restWith(BASE, 'GET', `${API_B()}/stats`);
  assertOk(res);
  assertExists(res.data.docs, 'docs stats');
});

test('Docs stats are project-scoped (different counts)', async () => {
  const resA = await restWith(BASE, 'GET', `${API_A()}/stats`);
  const resB = await restWith(BASE, 'GET', `${API_B()}/stats`);
  assertOk(resA); assertOk(resB);
  // Project A has 2 doc files, B has 1 — node counts should differ
  assert(resA.data.docs.nodes !== resB.data.docs.nodes,
    `docs nodes should differ: A=${resA.data.docs.nodes}, B=${resB.data.docs.nodes}`);
});

test('Shared graphs have same counts from both projects', async () => {
  const resA = await restWith(BASE, 'GET', `${API_A()}/stats`);
  const resB = await restWith(BASE, 'GET', `${API_B()}/stats`);
  assertOk(resA); assertOk(resB);
  assertEqual(resA.data.knowledge.nodes, resB.data.knowledge.nodes, 'knowledge nodes should be same');
  assertEqual(resA.data.tasks.nodes, resB.data.tasks.nodes, 'tasks nodes should be same');
});

// ─── Cleanup ─────────────────────────────────────────────────────

group('Cleanup');

test('Delete shared data', async () => {
  // Delete all notes
  const notes = await restWith(BASE, 'GET', `${API_A()}/knowledge/notes`);
  for (const n of (notes.data.results ?? notes.data)) {
    await restWith(BASE, 'DELETE', `${API_A()}/knowledge/notes/${n.id}`);
  }
  // Delete all tasks
  const tasks = await restWith(BASE, 'GET', `${API_A()}/tasks`);
  for (const t of (tasks.data.results ?? tasks.data)) {
    await restWith(BASE, 'DELETE', `${API_A()}/tasks/${t.id}`);
  }
  // Delete all skills
  const skills = await restWith(BASE, 'GET', `${API_A()}/skills`);
  for (const s of (skills.data.results ?? skills.data)) {
    await restWith(BASE, 'DELETE', `${API_A()}/skills/${s.id}`);
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
  return runPhase('Phase 15: Multi-project Workspace');
}

if (process.argv[1]?.includes('15-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
