import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveRequestAuthor, formatAuthor } from '@/lib/multi-config';
import {
  mirrorTaskRelation, mirrorNoteRelation, mirrorSkillRelation,
  mirrorAttachmentEvent,
} from '@/lib/file-mirror';
import { createTaskGraph, TaskGraphManager } from '@/graphs/task';
import { createKnowledgeGraph, KnowledgeGraphManager } from '@/graphs/knowledge';
import { createSkillGraph, SkillGraphManager } from '@/graphs/skill';
import type { GraphManagerContext, ExternalGraphs } from '@/graphs/manager-types';
import { embedFnPair } from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIM = 32;
const zeroVec = () => new Array(DIM).fill(0);
const fakeEmbed = (_q: string) => Promise.resolve(zeroVec());
const efns = embedFnPair(fakeEmbed);

function makeCtx(overrides: Partial<GraphManagerContext> = {}): GraphManagerContext {
  return {
    markDirty: () => {},
    emit: () => {},
    projectId: 'test',
    author: '',
    ...overrides,
  };
}

/** Read the last line of events.jsonl as parsed JSON. */
function readLastEvent(eventsPath: string): Record<string, unknown> {
  const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
}

/** Minimal task attrs for mirror functions. */
function stubTaskAttrs() {
  return {
    title: 'Test Task', description: 'desc', status: 'todo' as const,
    priority: 'medium' as const, tags: [] as string[], order: 0,
    assignee: null, dueDate: null, estimate: null, completedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    createdBy: undefined, updatedBy: undefined,
  };
}

/** Minimal note attrs for mirror functions. */
function stubNoteAttrs() {
  return {
    title: 'Test Note', content: 'content', tags: [] as string[],
    createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    createdBy: undefined, updatedBy: undefined,
  };
}

/** Minimal skill attrs for mirror functions. */
function stubSkillAttrs() {
  return {
    title: 'Test Skill', description: 'desc', steps: [] as string[],
    triggers: [] as string[], inputHints: [] as string[], filePatterns: [] as string[],
    tags: [] as string[], source: 'user' as const, confidence: 1,
    usageCount: 0, lastUsedAt: null,
    createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    createdBy: undefined, updatedBy: undefined,
  };
}

/** Create entity dir with a created event so relation/attachment events can append. */
function setupEntityDir(baseDir: string, entityId: string): string {
  const entityDir = path.join(baseDir, entityId);
  fs.mkdirSync(entityDir, { recursive: true });
  const eventsPath = path.join(entityDir, 'events.jsonl');
  fs.writeFileSync(eventsPath, JSON.stringify({ op: 'created', id: entityId, ts: Date.now() }) + '\n');
  return entityDir;
}

// ===========================================================================
// 1. resolveRequestAuthor
// ===========================================================================

describe('resolveRequestAuthor', () => {
  const users: Record<string, { name: string; email: string; apiKey: string; passwordHash?: string }> = {
    alice: { name: 'Alice', email: 'alice@test.com', apiKey: 'key-a' },
    bob: { name: 'Bob', email: 'bob@test.com', apiKey: 'key-b' },
    noname: { name: '', email: 'noname@test.com', apiKey: 'key-c' },
  };

  it('returns empty string when userId is undefined', () => {
    expect(resolveRequestAuthor(undefined, users)).toBe('');
  });

  it('returns empty string when users is undefined', () => {
    expect(resolveRequestAuthor('alice', undefined)).toBe('');
  });

  it('returns empty string when userId not found in users', () => {
    expect(resolveRequestAuthor('unknown', users)).toBe('');
  });

  it('returns "Name <email>" for valid userId', () => {
    expect(resolveRequestAuthor('alice', users)).toBe('Alice <alice@test.com>');
    expect(resolveRequestAuthor('bob', users)).toBe('Bob <bob@test.com>');
  });

  it('returns empty string when user.name is empty', () => {
    expect(resolveRequestAuthor('noname', users)).toBe('');
  });
});

describe('formatAuthor', () => {
  it('formats name and email', () => {
    expect(formatAuthor({ name: 'Alice', email: 'alice@test.com' })).toBe('Alice <alice@test.com>');
  });

  it('returns empty string when name is empty', () => {
    expect(formatAuthor({ name: '', email: 'a@b.com' })).toBe('');
  });
});

// ===========================================================================
// 2. Mirror functions — `by` in events
// ===========================================================================

describe('mirror by field', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'author-mirror-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('mirrorTaskRelation', () => {
    it('writes by when provided', () => {
      const tasksDir = path.join(tmpDir, '.tasks');
      const entityId = 'task-1';
      setupEntityDir(tasksDir, entityId);

      mirrorTaskRelation(tasksDir, entityId, 'add', 'blocks', 'task-2', stubTaskAttrs(), [], undefined, 'Alice <alice@test.com>');

      const last = readLastEvent(path.join(tasksDir, entityId, 'events.jsonl'));
      expect(last.op).toBe('relation');
      expect(last.by).toBe('Alice <alice@test.com>');
    });

    it('omits by when not provided', () => {
      const tasksDir = path.join(tmpDir, '.tasks');
      const entityId = 'task-2';
      setupEntityDir(tasksDir, entityId);

      mirrorTaskRelation(tasksDir, entityId, 'add', 'blocks', 'task-3', stubTaskAttrs(), []);

      const last = readLastEvent(path.join(tasksDir, entityId, 'events.jsonl'));
      expect(last.op).toBe('relation');
      expect(last.by).toBeUndefined();
    });
  });

  describe('mirrorNoteRelation', () => {
    it('writes by when provided', () => {
      const notesDir = path.join(tmpDir, '.notes');
      const entityId = 'note-1';
      setupEntityDir(notesDir, entityId);

      mirrorNoteRelation(notesDir, entityId, 'add', 'relates_to', 'note-2', stubNoteAttrs(), [], undefined, 'Bob <bob@test.com>');

      const last = readLastEvent(path.join(notesDir, entityId, 'events.jsonl'));
      expect(last.op).toBe('relation');
      expect(last.by).toBe('Bob <bob@test.com>');
    });
  });

  describe('mirrorSkillRelation', () => {
    it('writes by when provided', () => {
      const skillsDir = path.join(tmpDir, '.skills');
      const entityId = 'skill-1';
      setupEntityDir(skillsDir, entityId);

      mirrorSkillRelation(skillsDir, entityId, 'add', 'depends_on', 'skill-2', stubSkillAttrs(), [], undefined, 'Carol <carol@test.com>');

      const last = readLastEvent(path.join(skillsDir, entityId, 'events.jsonl'));
      expect(last.op).toBe('relation');
      expect(last.by).toBe('Carol <carol@test.com>');
    });
  });

  describe('mirrorAttachmentEvent', () => {
    it('writes by when provided', () => {
      const entityDir = setupEntityDir(tmpDir, 'entity-1');

      mirrorAttachmentEvent(entityDir, 'add', 'file.png', 'Dave <dave@test.com>');

      const last = readLastEvent(path.join(entityDir, 'events.jsonl'));
      expect(last.op).toBe('attachment');
      expect(last.by).toBe('Dave <dave@test.com>');
      expect(last.file).toBe('file.png');
    });

    it('omits by when not provided', () => {
      const entityDir = setupEntityDir(tmpDir, 'entity-2');

      mirrorAttachmentEvent(entityDir, 'add', 'doc.pdf');

      const last = readLastEvent(path.join(entityDir, 'events.jsonl'));
      expect(last.op).toBe('attachment');
      expect(last.by).toBeUndefined();
    });
  });
});

// ===========================================================================
// 3. Manager author override
// ===========================================================================

describe('TaskGraphManager author override', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'author-task-mgr-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeTaskManager(ctxAuthor = 'Config Author <config@test.com>') {
    const graph = createTaskGraph();
    const ctx = makeCtx({ author: ctxAuthor, projectDir: tmpDir });
    const ext: ExternalGraphs = {};
    return new TaskGraphManager(graph, efns, ctx, ext);
  }

  it('createTask with explicit author sets createdBy/updatedBy', async () => {
    const mgr = makeTaskManager();
    const id = await mgr.createTask('Test', 'desc', 'todo', 'medium', [], null, null, null, undefined, 'Explicit <explicit@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'createdBy')).toBe('Explicit <explicit@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'updatedBy')).toBe('Explicit <explicit@test.com>');
  });

  it('createTask without author falls back to ctx.author', async () => {
    const mgr = makeTaskManager('Config Author <config@test.com>');
    const id = await mgr.createTask('Fallback Test', 'desc');
    expect(mgr.graph.getNodeAttribute(id, 'createdBy')).toBe('Config Author <config@test.com>');
  });

  it('updateTask with explicit author sets updatedBy', async () => {
    const mgr = makeTaskManager();
    const id = await mgr.createTask('Original', 'desc');
    await mgr.updateTask(id, { title: 'Updated' }, undefined, 'Updater <updater@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'updatedBy')).toBe('Updater <updater@test.com>');
  });

  it('moveTask with explicit author writes by in mirror', async () => {
    const mgr = makeTaskManager();
    const id = await mgr.createTask('Move Me', 'desc', 'backlog');
    mgr.moveTask(id, 'in_progress', undefined, undefined, 'Mover <mover@test.com>');

    const eventsPath = path.join(tmpDir, '.tasks', id, 'events.jsonl');
    const lines = fs.readFileSync(eventsPath, 'utf-8').trim().split('\n');
    // Last event should be the update from moveTask
    const lastEvent = JSON.parse(lines[lines.length - 1]);
    expect(lastEvent.by).toBe('Mover <mover@test.com>');
  });

  it('linkTasks with author writes by in mirror relation event', async () => {
    const mgr = makeTaskManager();
    const id1 = await mgr.createTask('Task A', 'desc');
    const id2 = await mgr.createTask('Task B', 'desc');
    mgr.linkTasks(id1, id2, 'blocks', 'Linker <linker@test.com>');

    const eventsPath = path.join(tmpDir, '.tasks', id1, 'events.jsonl');
    const last = readLastEvent(eventsPath);
    expect(last.op).toBe('relation');
    expect(last.by).toBe('Linker <linker@test.com>');
  });

  it('addAttachment with author writes by in mirror attachment event', async () => {
    const mgr = makeTaskManager();
    const id = await mgr.createTask('Attach Test', 'desc');
    const data = Buffer.from('test data');
    mgr.addAttachment(id, 'file.txt', data, 'Attacher <attacher@test.com>');

    const eventsPath = path.join(tmpDir, '.tasks', id, 'events.jsonl');
    const last = readLastEvent(eventsPath);
    expect(last.op).toBe('attachment');
    expect(last.by).toBe('Attacher <attacher@test.com>');
  });
});

describe('KnowledgeGraphManager author override', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'author-know-mgr-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeKnowledgeManager(ctxAuthor = 'Config Author <config@test.com>') {
    const graph = createKnowledgeGraph();
    const ctx = makeCtx({ author: ctxAuthor, projectDir: tmpDir });
    const ext: ExternalGraphs = {};
    return new KnowledgeGraphManager(graph, efns, ctx, ext);
  }

  it('createNote with explicit author sets createdBy/updatedBy', async () => {
    const mgr = makeKnowledgeManager();
    const id = await mgr.createNote('Test Note', 'content', ['tag'], 'Explicit <explicit@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'createdBy')).toBe('Explicit <explicit@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'updatedBy')).toBe('Explicit <explicit@test.com>');
  });

  it('createNote without author falls back to ctx.author', async () => {
    const mgr = makeKnowledgeManager('Ctx User <ctx@test.com>');
    const id = await mgr.createNote('Fallback', 'content');
    expect(mgr.graph.getNodeAttribute(id, 'createdBy')).toBe('Ctx User <ctx@test.com>');
  });

  it('updateNote with explicit author sets updatedBy', async () => {
    const mgr = makeKnowledgeManager();
    const id = await mgr.createNote('Original', 'content');
    await mgr.updateNote(id, { title: 'Updated' }, undefined, 'Editor <editor@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'updatedBy')).toBe('Editor <editor@test.com>');
  });

  it('createRelation with author writes by in mirror relation event', async () => {
    const mgr = makeKnowledgeManager();
    const id1 = await mgr.createNote('Note A', 'content');
    const id2 = await mgr.createNote('Note B', 'content');
    mgr.createRelation(id1, id2, 'relates_to', undefined, undefined, 'Linker <linker@test.com>');

    const eventsPath = path.join(tmpDir, '.notes', id1, 'events.jsonl');
    const last = readLastEvent(eventsPath);
    expect(last.op).toBe('relation');
    expect(last.by).toBe('Linker <linker@test.com>');
  });

  it('addAttachment with author writes by in mirror attachment event', async () => {
    const mgr = makeKnowledgeManager();
    const id = await mgr.createNote('Attach Note', 'content');
    const data = Buffer.from('test data');
    mgr.addAttachment(id, 'file.txt', data, 'Attacher <attacher@test.com>');

    const eventsPath = path.join(tmpDir, '.notes', id, 'events.jsonl');
    const last = readLastEvent(eventsPath);
    expect(last.op).toBe('attachment');
    expect(last.by).toBe('Attacher <attacher@test.com>');
  });
});

describe('SkillGraphManager author override', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'author-skill-mgr-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeSkillManager(ctxAuthor = 'Config Author <config@test.com>') {
    const graph = createSkillGraph();
    const ctx = makeCtx({ author: ctxAuthor, projectDir: tmpDir });
    const ext: ExternalGraphs = {};
    return new SkillGraphManager(graph, efns, ctx, ext);
  }

  it('createSkill with explicit author sets createdBy/updatedBy', async () => {
    const mgr = makeSkillManager();
    const id = await mgr.createSkill('Test Skill', 'desc', [], [], [], [], [], 'user', 1, 'Explicit <explicit@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'createdBy')).toBe('Explicit <explicit@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'updatedBy')).toBe('Explicit <explicit@test.com>');
  });

  it('createSkill without author falls back to ctx.author', async () => {
    const mgr = makeSkillManager('Ctx User <ctx@test.com>');
    const id = await mgr.createSkill('Fallback Skill', 'desc');
    expect(mgr.graph.getNodeAttribute(id, 'createdBy')).toBe('Ctx User <ctx@test.com>');
  });

  it('updateSkill with explicit author sets updatedBy', async () => {
    const mgr = makeSkillManager();
    const id = await mgr.createSkill('Original Skill', 'desc');
    await mgr.updateSkill(id, { title: 'Updated Skill' }, undefined, 'Editor <editor@test.com>');
    expect(mgr.graph.getNodeAttribute(id, 'updatedBy')).toBe('Editor <editor@test.com>');
  });

  it('linkSkills with author writes by in mirror relation event', async () => {
    const mgr = makeSkillManager();
    const id1 = await mgr.createSkill('Skill A', 'desc');
    const id2 = await mgr.createSkill('Skill B', 'desc');
    mgr.linkSkills(id1, id2, 'depends_on', 'Linker <linker@test.com>');

    const eventsPath = path.join(tmpDir, '.skills', id1, 'events.jsonl');
    const last = readLastEvent(eventsPath);
    expect(last.op).toBe('relation');
    expect(last.by).toBe('Linker <linker@test.com>');
  });

  it('addAttachment with author writes by in mirror attachment event', async () => {
    const mgr = makeSkillManager();
    const id = await mgr.createSkill('Attach Skill', 'desc');
    const data = Buffer.from('test data');
    mgr.addAttachment(id, 'file.txt', data, 'Attacher <attacher@test.com>');

    const eventsPath = path.join(tmpDir, '.skills', id, 'events.jsonl');
    const last = readLastEvent(eventsPath);
    expect(last.op).toBe('attachment');
    expect(last.by).toBe('Attacher <attacher@test.com>');
  });
});
