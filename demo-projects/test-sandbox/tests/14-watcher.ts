/**
 * Phase 14: File Watcher & Re-indexing
 *
 * Uses default sandbox config (port 3737).
 * Tests: add/modify/delete files → docs/code/files re-indexed.
 */

import {
  group, test, runPhase,
  assert, assertEqual, assertExists, assertOk, assertStatus,
  printSummary, wait,
  startServer, stopServer, restWith,
  fileExists, writeFile, projectPath,
} from './utils';
import { unlinkSync } from 'fs';

const PORT = 3737;
const CONFIG = 'tests/configs/sandbox.yaml';
let BASE = '';

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Start server', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
  assertExists(BASE, 'base url');
});

// ─── 14.1 Docs watcher ─────────────────────────────────────────

group('14.1 Docs watcher — add/modify/delete');

test('Add new .md file → indexed as doc', async () => {
  // Check initial count
  const before = await restWith(BASE, 'GET', '/api/projects/sandbox/docs/topics');
  const countBefore = (before.data.results ?? before.data).length;

  // Write a new markdown file
  writeFile(projectPath('docs', 'watcher-test.md'), '# Watcher Test\n\nThis doc was added by the watcher test.\n');
  await wait(3000); // Wait for watcher to pick up

  const after = await restWith(BASE, 'GET', '/api/projects/sandbox/docs/topics');
  const countAfter = (after.data.results ?? after.data).length;
  assert(countAfter > countBefore, `doc count should increase: ${countBefore} → ${countAfter}`);
});

test('Modify .md file → doc re-indexed', async () => {
  writeFile(projectPath('docs', 'watcher-test.md'), '# Watcher Test Updated\n\nContent was modified.\n\n## New Section\n\nNew content here.\n');
  await wait(3000);

  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/docs/search?q=modified');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find modified content');
});

test('Delete .md file → doc removed', async () => {
  const before = await restWith(BASE, 'GET', '/api/projects/sandbox/docs/topics');
  const countBefore = (before.data.results ?? before.data).length;

  unlinkSync(projectPath('docs', 'watcher-test.md'));
  await wait(3000);

  const after = await restWith(BASE, 'GET', '/api/projects/sandbox/docs/topics');
  const countAfter = (after.data.results ?? after.data).length;
  assert(countAfter < countBefore, `doc count should decrease: ${countBefore} → ${countAfter}`);
});

// ─── 14.2 Code watcher ─────────────────────────────────────────

group('14.2 Code watcher — add/delete');

test('Add new .ts file → indexed as code', async () => {
  const before = await restWith(BASE, 'GET', '/api/projects/sandbox/code/files');
  const countBefore = (before.data.results ?? before.data).length;

  writeFile(projectPath('src', 'watcher-test.ts'),
    'export function watcherTestFn(): string { return "watched"; }\n');
  await wait(3000);

  const after = await restWith(BASE, 'GET', '/api/projects/sandbox/code/files');
  const countAfter = (after.data.results ?? after.data).length;
  assert(countAfter > countBefore, `code file count should increase: ${countBefore} → ${countAfter}`);
});

test('Search for new symbol', async () => {
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/code/search?q=watcherTestFn');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find watcherTestFn');
});

test('Delete .ts file → code removed', async () => {
  unlinkSync(projectPath('src', 'watcher-test.ts'));
  await wait(3000);

  // Verify the file is no longer in the code files list
  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/code/files');
  assertOk(res);
  const files = (res.data.results ?? res.data).map((f: any) => f.fileId ?? f.id);
  assert(!files.some((f: string) => f.includes('watcher-test')), 'deleted file should not be in code files');
});

// ─── 14.3 File index watcher ────────────────────────────────────

group('14.3 File index watcher');

test('Add file → appears in file index', async () => {
  writeFile(projectPath('watcher-file-test.txt'), 'test file for watcher');
  await wait(3000);

  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/files/search?q=watcher-file-test');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find new file in index');
});

test('Delete file → removed from file index', async () => {
  unlinkSync(projectPath('watcher-file-test.txt'));
  await wait(3000);

  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/files/info?path=watcher-file-test.txt');
  assertStatus(res, 404);
});

// ─── 14.4 Excluded patterns ─────────────────────────────────────

group('14.4 Excluded patterns');

test('File in node_modules not indexed', async () => {
  const { mkdirSync } = require('fs');
  try { mkdirSync(projectPath('node_modules'), { recursive: true }); } catch {}
  writeFile(projectPath('node_modules', 'ignored.ts'), 'export const x = 1;');
  await wait(3000);

  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/files/info?path=node_modules/ignored.ts');
  assertStatus(res, 404);

  unlinkSync(projectPath('node_modules', 'ignored.ts'));
  try { require('fs').rmdirSync(projectPath('node_modules')); } catch {}
});

test('File outside include glob not indexed as code', async () => {
  // Config has code include: src/**/*.ts
  // File in docs/ with .ts should NOT be indexed as code
  writeFile(projectPath('docs', 'not-code.ts'), 'export const y = 2;');
  await wait(3000);

  const res = await restWith(BASE, 'GET', '/api/projects/sandbox/code/files');
  assertOk(res);
  const files = (res.data.results ?? res.data).map((f: any) => f.fileId ?? f.id);
  assert(!files.some((f: string) => f.includes('not-code')), 'docs/*.ts should not be in code index');

  unlinkSync(projectPath('docs', 'not-code.ts'));
});

// ─── Teardown ────────────────────────────────────────────────────

group('Teardown');

test('Stop server', async () => {
  stopServer();
  await wait(500);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 14: File Watcher & Re-indexing');
}

if (process.argv[1]?.includes('14-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
