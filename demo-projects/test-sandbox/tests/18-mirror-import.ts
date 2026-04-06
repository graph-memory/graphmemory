/**
 * Phase 18: Mirror File Reverse Import
 *
 * Uses default sandbox config (port 3737).
 * Tests: editing .notes/.tasks/.skills .md files → DB updates.
 */

import {
  group, test, runPhase,
  assert, assertEqual, assertExists, assertOk,
  printSummary, wait,
  startServer, stopServer, restWith,
  fileExists, readFile, writeFile, projectPath,
} from './utils';
import { readdirSync } from 'fs';
import { join } from 'path';

const PORT = 3737;
const CONFIG = 'graph-memory.yaml';
let BASE = '';

let noteId: number;
let noteSlug: string;
let taskId: number;
let taskSlug: string;

// ─── Setup ───────────────────────────────────────────────────────

group('Setup');

test('Start server', async () => {
  BASE = await startServer({ config: CONFIG, port: PORT });
  assertExists(BASE, 'base url');
});

// ─── 18.1 Note mirror reverse import ───────────────────────────

group('18.1 Note mirror reverse import');

test('Create note → mirror file created', async () => {
  const res = await restWith(BASE, 'POST', '/api/projects/sandbox/knowledge/notes', {
    title: 'Mirror Import Test',
    content: 'Original content from API.',
    tags: ['mirror-test'],
  });
  assertOk(res);
  noteId = res.data.id;
  noteSlug = res.data.slug ?? '';
  await wait(2000);

  // Find the mirror file
  const notesDir = projectPath('.notes');
  assert(fileExists(notesDir), '.notes/ should exist');
});

test('Edit mirror file → note updated in DB', async () => {
  // Find the .md file for this note (may be in subdirectory)
  const notesDir = projectPath('.notes');
  const allFiles: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) walk(join(dir, entry.name));
      else if (entry.name.endsWith('.md')) allFiles.push(join(dir, entry.name));
    }
  };
  walk(notesDir);
  const files = allFiles;
  assert(files.length > 0, `should have mirror file in ${notesDir}`);

  // Find the note.md file for our note (in slug directory)
  const noteFile = files.find(f => f.endsWith('note.md') && (noteSlug ? f.includes(noteSlug) : true)) ?? files[0];
  const filePath = noteFile;

  // Read current content
  const current = readFile(filePath);
  assert(current.includes('Mirror Import Test'), `file should contain title, got: ${current.substring(0, 100)}`);

  // Modify the content in the note.md file
  const modified = current.replace('Original content from API.', 'Modified via file system edit.');
  writeFile(filePath, modified);

  // Wait for watcher to pick up the change
  await wait(3000);

  // Verify DB was updated
  const res = await restWith(BASE, 'GET', `/api/projects/sandbox/knowledge/notes/${noteId}`);
  assertOk(res);
  assert(
    res.data.content.includes('Modified via file system edit'),
    `content should be updated, got: "${res.data.content.substring(0, 60)}..."`,
  );
});

// ─── 18.2 Task mirror reverse import ───────────────────────────

group('18.2 Task mirror reverse import');

test('Create task → mirror file created', async () => {
  const res = await restWith(BASE, 'POST', '/api/projects/sandbox/tasks', {
    title: 'Mirror Task Test',
    description: 'Original task description.',
    priority: 'medium',
  });
  assertOk(res);
  taskId = res.data.id;
  taskSlug = res.data.slug;
  await wait(1000);

  const tasksDir = projectPath('.tasks');
  assert(fileExists(tasksDir), '.tasks/ should exist');
});

test('Edit task mirror file → task updated in DB', async () => {
  // Find task files (may be in subdirectories by status)
  const tasksDir = projectPath('.tasks');
  let taskFile = '';

  // Search recursively for a .md file containing the slug
  const findFile = (dir: string): string | null => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const found = findFile(join(dir, entry.name));
        if (found) return found;
      } else if (entry.name.endsWith('.md')) {
        const content = readFile(join(dir, entry.name));
        if (content.includes(taskSlug) || content.includes('Mirror Task Test')) {
          return join(dir, entry.name);
        }
      }
    }
    return null;
  };

  taskFile = findFile(tasksDir) ?? '';
  assert(taskFile !== '', 'should find task mirror file');

  // Modify the description in the file
  const current = readFile(taskFile);
  const modified = current.replace('Original task description.', 'Description edited via mirror.');
  writeFile(taskFile, modified);
  await wait(3000);

  // Verify DB update
  const res = await restWith(BASE, 'GET', `/api/projects/sandbox/tasks/${taskId}`);
  assertOk(res);
  assert(
    res.data.description.includes('Description edited via mirror'),
    `description should be updated, got: "${res.data.description.substring(0, 60)}..."`,
  );
});

// ─── Cleanup ─────────────────────────────────────────────────────

group('Cleanup');

test('Delete test data', async () => {
  if (noteId) await restWith(BASE, 'DELETE', `/api/projects/sandbox/knowledge/notes/${noteId}`);
  if (taskId) await restWith(BASE, 'DELETE', `/api/projects/sandbox/tasks/${taskId}`);
  await wait(500);
});

// ─── Teardown ────────────────────────────────────────────────────

group('Teardown');

test('Stop server', async () => {
  stopServer();
  await wait(500);
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 18: Mirror File Reverse Import');
}

if (process.argv[1]?.includes('18-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
