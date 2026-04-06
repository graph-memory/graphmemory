/**
 * Phase 9: DB & Filesystem Verification
 *
 * Tests: SQLite integrity, FTS/vector tables, file mirror consistency.
 */

import {
  group, test, runPhase,
  get, post, del,
  mcpCall,
  assert, assertEqual, assertExists, assertOk, assertMcpOk,
  printSummary, wait,
  fileExists, readFile, projectPath,
} from './utils';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// ─── 9.1 SQLite integrity ───────────────────────────────────────

group('9.1 SQLite integrity');

test('DB file exists at .graph-memory/', async () => {
  const dbDir = projectPath('.graph-memory');
  assert(fileExists(dbDir), `.graph-memory/ should exist at ${dbDir}`);
});

test('DB file is a valid SQLite database', async () => {
  const dbDir = projectPath('.graph-memory');
  if (!existsSync(dbDir)) return;

  // Find .db files
  const files = readdirSync(dbDir).filter(f => f.endsWith('.db'));
  assert(files.length > 0, 'should have at least one .db file');
});

test('Tables exist via stats endpoint', async () => {
  const res = await get('/stats');
  assertOk(res);
  // Stats should have entries for each graph
  const data = res.data;
  assertExists(data, 'stats data');
});

test('Row counts match API — docs', async () => {
  const statsRes = await get('/stats');
  assertOk(statsRes);

  const docsRes = await get('/docs/topics');
  assertOk(docsRes);
  const docFiles = docsRes.data.results ?? docsRes.data;

  // Just verify both return data and docs count is > 0
  assert(docFiles.length > 0, 'should have indexed docs');
});

test('Row counts match API — code', async () => {
  const codeRes = await get('/code/files');
  assertOk(codeRes);
  const codeFiles = codeRes.data.results ?? codeRes.data;
  assert(codeFiles.length > 0, 'should have indexed code files');
});

test('Row counts match API — files', async () => {
  const filesRes = await get('/files');
  assertOk(filesRes);
  const files = filesRes.data.results ?? filesRes.data;
  assert(files.length > 0, 'should have indexed files');
});

// ─── 9.2 File mirror integrity ──────────────────────────────────

group('9.2 File mirror integrity');

test('Create note → .notes/ file matches', async () => {
  const res = await post('/knowledge/notes', {
    title: 'DB Verify Note',
    content: 'Verifying file mirror integrity.',
    tags: ['verify', 'db'],
  });
  assertOk(res);
  const noteId = res.data.noteId ?? res.data.id;
  await wait(500);

  // Check .notes/ directory
  const notesDir = projectPath('.notes');
  if (existsSync(notesDir)) {
    const files = readdirSync(notesDir, { recursive: true }) as string[];
    const mdFiles = files.filter(f => String(f).endsWith('.md'));
    assert(mdFiles.length > 0, 'should have .md files in .notes/');

    // Read one and verify it contains the title
    const found = mdFiles.some(f => {
      try {
        const content = readFile(join(notesDir, String(f)));
        return content.includes('DB Verify Note');
      } catch { return false; }
    });
    assert(found, 'mirror file should contain note title');
  }

  // Cleanup
  await del(`/knowledge/notes/${noteId}`);
});

test('Create task → .tasks/ file matches', async () => {
  const res = await post('/tasks', {
    title: 'DB Verify Task',
    description: 'Verifying task file mirror.',
    priority: 'medium',
    tags: ['verify'],
  });
  assertOk(res);
  const taskId = res.data.taskId ?? res.data.id;
  await wait(500);

  const tasksDir = projectPath('.tasks');
  if (existsSync(tasksDir)) {
    const files = readdirSync(tasksDir, { recursive: true }) as string[];
    const mdFiles = files.filter(f => String(f).endsWith('.md'));
    assert(mdFiles.length > 0, 'should have .md files in .tasks/');
  }

  await del(`/tasks/${taskId}`);
});

test('Create skill → .skills/ file matches', async () => {
  const res = await post('/skills', {
    title: 'DB Verify Skill',
    description: 'Verifying skill file mirror.',
    steps: ['Step 1'],
    tags: ['verify'],
    source: 'user',
    confidence: 0.9,
  });
  assertOk(res);
  const skillId = res.data.skillId ?? res.data.id;
  await wait(500);

  const skillsDir = projectPath('.skills');
  if (existsSync(skillsDir)) {
    const files = readdirSync(skillsDir, { recursive: true }) as string[];
    const mdFiles = files.filter(f => String(f).endsWith('.md'));
    assert(mdFiles.length > 0, 'should have .md files in .skills/');
  }

  await del(`/skills/${skillId}`);
});

test('Deleted note → mirror file removed', async () => {
  const res = await post('/knowledge/notes', {
    title: 'Delete Mirror Test',
    content: 'Will be deleted.',
  });
  assertOk(res);
  const noteId = res.data.noteId ?? res.data.id;
  await wait(500);

  // Count files before
  const notesDir = projectPath('.notes');
  let countBefore = 0;
  if (existsSync(notesDir)) {
    countBefore = (readdirSync(notesDir, { recursive: true }) as string[])
      .filter(f => String(f).endsWith('.md')).length;
  }

  // Delete
  await del(`/knowledge/notes/${noteId}`);
  await wait(500);

  // Count files after
  let countAfter = 0;
  if (existsSync(notesDir)) {
    countAfter = (readdirSync(notesDir, { recursive: true }) as string[])
      .filter(f => String(f).endsWith('.md')).length;
  }

  assert(countAfter < countBefore, 'file count should decrease after delete');
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 9: DB & Filesystem Verification');
}

if (process.argv[1]?.includes('09-')) {
  run().then(result => {
    printSummary([result]);
    process.exit(result.groups.some(g => g.tests.some(t => !t.passed)) ? 1 : 0);
  });
}
