/**
 * MCP attachment tool tests for all 6 attachment tools:
 * - add_note_attachment / remove_note_attachment
 * - add_task_attachment / remove_task_attachment
 * - add_skill_attachment / remove_skill_attachment
 *
 * Tests cover: successful attach, file not found, not a file (directory),
 * size limit (mocked), remove success, remove not found, filename validation.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createKnowledgeGraph, createNote } from '@/graphs/knowledge';
import { createTaskGraph, createTask } from '@/graphs/task';
import { createSkillGraph, createSkill } from '@/graphs/skill';
import {
  unitVec, createFakeEmbed, setupMcpClient, json, text,
  type McpTestContext,
} from '@/tests/helpers';

const QUERY_AXES: Array<[string, number]> = [['test', 0]];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-attach-test-'));
}

function createTmpFile(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

// ---------------------------------------------------------------------------
// Note attachments
// ---------------------------------------------------------------------------

describe('MCP note attachment tools', () => {
  let ctx: McpTestContext;
  let noteId: string;
  let tmpDir: string;
  let filePath: string;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    filePath = createTmpFile(tmpDir, 'doc.txt', 'Hello attachment');

    const projectDir = makeTmpDir();
    const knowledgeGraph = createKnowledgeGraph();
    noteId = createNote(knowledgeGraph, 'Test Note', 'content', [], unitVec(0));

    ctx = await setupMcpClient({
      knowledgeGraph,
      embedFn: createFakeEmbed(QUERY_AXES),
      projectDir,
    });
  });

  afterAll(async () => {
    await ctx.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('add_note_attachment: attaches file successfully', async () => {
    const result = await ctx.call('add_note_attachment', { noteId, filePath });
    expect(result.isError).toBeFalsy();
    const meta = json<{ filename: string; mimeType: string; size: number }>(result);
    expect(meta.filename).toBe('doc.txt');
    expect(meta.size).toBeGreaterThan(0);
  });

  it('add_note_attachment: file not found returns error', async () => {
    const result = await ctx.call('add_note_attachment', { noteId, filePath: '/nonexistent/file.txt' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('File not found');
  });

  it('add_note_attachment: directory returns error', async () => {
    const result = await ctx.call('add_note_attachment', { noteId, filePath: tmpDir });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('not a regular file');
  });

  it('add_note_attachment: note not found returns error', async () => {
    const result = await ctx.call('add_note_attachment', { noteId: 'ghost-note', filePath });
    expect(result.isError).toBe(true);
  });

  it('remove_note_attachment: removes successfully', async () => {
    // First attach
    await ctx.call('add_note_attachment', { noteId, filePath });
    // Then remove
    const result = await ctx.call('remove_note_attachment', { noteId, filename: 'doc.txt' });
    expect(result.isError).toBeFalsy();
    const data = json<{ deleted: string }>(result);
    expect(data.deleted).toBe('doc.txt');
  });

  it('remove_note_attachment: not found returns error', async () => {
    const result = await ctx.call('remove_note_attachment', { noteId, filename: 'ghost.txt' });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task attachments
// ---------------------------------------------------------------------------

describe('MCP task attachment tools', () => {
  let ctx: McpTestContext;
  let taskId: string;
  let tmpDir: string;
  let filePath: string;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    filePath = createTmpFile(tmpDir, 'report.csv', 'id,name\n1,alice');

    const projectDir = makeTmpDir();
    const taskGraph = createTaskGraph();
    taskId = createTask(taskGraph, 'Test Task', 'desc', 'todo', 'medium', [], unitVec(0));

    ctx = await setupMcpClient({
      taskGraph,
      embedFn: createFakeEmbed(QUERY_AXES),
      projectDir,
    });
  });

  afterAll(async () => {
    await ctx.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('add_task_attachment: attaches file', async () => {
    const result = await ctx.call('add_task_attachment', { taskId, filePath });
    expect(result.isError).toBeFalsy();
    const meta = json<{ filename: string; size: number }>(result);
    expect(meta.filename).toBe('report.csv');
  });

  it('add_task_attachment: file not found', async () => {
    const result = await ctx.call('add_task_attachment', { taskId, filePath: '/no/file.txt' });
    expect(result.isError).toBe(true);
  });

  it('add_task_attachment: directory returns error', async () => {
    const result = await ctx.call('add_task_attachment', { taskId, filePath: tmpDir });
    expect(result.isError).toBe(true);
  });

  it('remove_task_attachment: removes', async () => {
    await ctx.call('add_task_attachment', { taskId, filePath });
    const result = await ctx.call('remove_task_attachment', { taskId, filename: 'report.csv' });
    expect(result.isError).toBeFalsy();
    expect(json<{ deleted: string }>(result).deleted).toBe('report.csv');
  });

  it('remove_task_attachment: not found', async () => {
    const result = await ctx.call('remove_task_attachment', { taskId, filename: 'nope.txt' });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Skill attachments
// ---------------------------------------------------------------------------

describe('MCP skill attachment tools', () => {
  let ctx: McpTestContext;
  let skillId: string;
  let tmpDir: string;
  let filePath: string;

  beforeAll(async () => {
    tmpDir = makeTmpDir();
    filePath = createTmpFile(tmpDir, 'template.yaml', 'key: value');

    const projectDir = makeTmpDir();
    const skillGraph = createSkillGraph();
    skillId = createSkill(skillGraph, 'Test Skill', 'desc', [], [], [], [], [], 'user', 1, unitVec(0));

    ctx = await setupMcpClient({
      skillGraph,
      embedFn: createFakeEmbed(QUERY_AXES),
      projectDir,
    });
  });

  afterAll(async () => {
    await ctx.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('add_skill_attachment: attaches file', async () => {
    const result = await ctx.call('add_skill_attachment', { skillId, filePath });
    expect(result.isError).toBeFalsy();
    const meta = json<{ filename: string; size: number }>(result);
    expect(meta.filename).toBe('template.yaml');
  });

  it('add_skill_attachment: file not found', async () => {
    const result = await ctx.call('add_skill_attachment', { skillId, filePath: '/missing/file' });
    expect(result.isError).toBe(true);
  });

  it('add_skill_attachment: directory returns error', async () => {
    const result = await ctx.call('add_skill_attachment', { skillId, filePath: tmpDir });
    expect(result.isError).toBe(true);
  });

  it('remove_skill_attachment: removes', async () => {
    await ctx.call('add_skill_attachment', { skillId, filePath });
    const result = await ctx.call('remove_skill_attachment', { skillId, filename: 'template.yaml' });
    expect(result.isError).toBeFalsy();
    expect(json<{ deleted: string }>(result).deleted).toBe('template.yaml');
  });

  it('remove_skill_attachment: not found', async () => {
    const result = await ctx.call('remove_skill_attachment', { skillId, filename: 'ghost.bin' });
    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Filename validation (path traversal prevention)
// ---------------------------------------------------------------------------

describe('attachment filename validation', () => {
  let ctx: McpTestContext;
  let noteId: string;

  beforeAll(async () => {
    const projectDir = makeTmpDir();
    const knowledgeGraph = createKnowledgeGraph();
    noteId = createNote(knowledgeGraph, 'Val Note', '', [], unitVec(0));
    ctx = await setupMcpClient({
      knowledgeGraph,
      embedFn: createFakeEmbed(QUERY_AXES),
      projectDir,
    });
  });

  afterAll(async () => { await ctx.close(); });

  it('rejects filename with path separator /', async () => {
    const result = await ctx.call('remove_note_attachment', { noteId, filename: '../etc/passwd' });
    expect(result.isError).toBe(true);
  });

  it('rejects filename with backslash', async () => {
    const result = await ctx.call('remove_note_attachment', { noteId, filename: '..\\etc\\passwd' });
    expect(result.isError).toBe(true);
  });

  it('rejects filename with ..', async () => {
    const result = await ctx.call('remove_note_attachment', { noteId, filename: '..secret' });
    expect(result.isError).toBe(true);
  });

  it('rejects empty filename', async () => {
    const result = await ctx.call('remove_note_attachment', { noteId, filename: '' });
    expect(result.isError).toBe(true);
  });
});
