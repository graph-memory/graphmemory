import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import express from 'express';
import { EventEmitter } from 'events';
import { createRestApp } from '@/api/rest/index';
import { createKnowledgeGraph, KnowledgeGraphManager } from '@/graphs/knowledge';
import { createFileIndexGraph } from '@/graphs/file-index-types';
import { createTaskGraph, TaskGraphManager } from '@/graphs/task';
import { createSkillGraph, SkillGraphManager } from '@/graphs/skill';
import { FileIndexGraphManager } from '@/graphs/file-index';
import { noopContext } from '@/graphs/manager-types';
import { PromiseQueue } from '@/lib/promise-queue';
import { unitVec, DIM, embedFnPair } from '@/tests/helpers';
import type { GraphManagerContext } from '@/graphs/manager-types';
import type { ProjectManager, ProjectInstance } from '@/lib/project-manager';

// ---------------------------------------------------------------------------
// Setup: fake project manager with one project
// ---------------------------------------------------------------------------

function fakeEmbed(q: string): Promise<number[]> {
  return Promise.resolve(unitVec(q.length % DIM));
}

const TEST_EMBEDDING = { model: 'test', pooling: 'mean' as const, normalize: true, queryPrefix: '', documentPrefix: '', batchSize: 1 };

function testGraphConfigs() {
  return Object.fromEntries(
    ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'].map(g => [g, {
      enabled: true,
      pattern: g === 'docs' ? '**/*.md' : g === 'code' ? '**/*.ts' : undefined,
      embedding: { ...TEST_EMBEDDING },
    }]),
  ) as any;
}

function createTestProject(): ProjectInstance {
  const knowledgeGraph = createKnowledgeGraph();
  const fileIndexGraph = createFileIndexGraph();
  const taskGraph = createTaskGraph();
  const skillGraph = createSkillGraph();
  const ctx = noopContext('test');
  const ext = { knowledgeGraph, fileIndexGraph, taskGraph, skillGraph };

  return {
    id: 'test',
    config: {
      projectDir: '/tmp/test',
      graphMemory: '/tmp/test/.graph-memory',
      excludePattern: 'node_modules/**',
      chunkDepth: 4,
      maxTokensDefault: 4000,
      embedMaxChars: 2000,
      embedding: { ...TEST_EMBEDDING },
      graphConfigs: testGraphConfigs(),
      author: { name: '', email: '' },
    },
    knowledgeGraph,
    fileIndexGraph,
    taskGraph,
    skillGraph,
    knowledgeManager: new KnowledgeGraphManager(knowledgeGraph, embedFnPair(fakeEmbed), ctx, ext),
    fileIndexManager: new FileIndexGraphManager(fileIndexGraph, embedFnPair(fakeEmbed)),
    taskManager: new TaskGraphManager(taskGraph, embedFnPair(fakeEmbed), ctx, ext),
    skillManager: new SkillGraphManager(skillGraph, embedFnPair(fakeEmbed), ctx, ext),
    embedFns: {
      docs: embedFnPair(fakeEmbed),
      code: embedFnPair(fakeEmbed),
      knowledge: embedFnPair(fakeEmbed),
      tasks: embedFnPair(fakeEmbed),
      files: embedFnPair(fakeEmbed),
      skills: embedFnPair(fakeEmbed),
    },
    mutationQueue: new PromiseQueue(),
    dirty: false,
  };
}

function createTestManager(project: ProjectInstance): ProjectManager {
  const emitter = new EventEmitter();
  const manager = Object.assign(emitter, {
    getProject: (id: string) => id === 'test' ? project : undefined,
    listProjects: () => ['test'],
    markDirty: () => {},
  }) as any as ProjectManager;
  return manager;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('REST API', () => {
  let app: express.Express;
  let project: ProjectInstance;

  beforeEach(() => {
    project = createTestProject();
    const manager = createTestManager(project);
    app = createRestApp(manager);
  });

  describe('GET /api/projects', () => {
    it('lists projects wrapped in results', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].id).toBe('test');
      expect(res.body.results[0].projectDir).toBe('/tmp/test');
      expect(res.body.results[0].stats).toBeDefined();
    });
  });

  describe('GET /api/projects/:id/stats', () => {
    it('returns graph stats', async () => {
      const res = await request(app).get('/api/projects/test/stats');
      expect(res.status).toBe(200);
      expect(res.body.knowledge).toBeDefined();
      expect(res.body.tasks).toBeDefined();
      expect(res.body.fileIndex).toBeDefined();
    });

    it('returns 404 for unknown project', async () => {
      const res = await request(app).get('/api/projects/unknown/stats');
      expect(res.status).toBe(404);
    });
  });

  describe('Knowledge CRUD', () => {
    it('creates a note', async () => {
      const res = await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Test Note', content: 'Some content', tags: ['test'] });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('test-note');
      expect(res.body.title).toBe('Test Note');
    });

    it('gets a note', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'My Note', content: 'Content here' });

      const res = await request(app).get('/api/projects/test/knowledge/notes/my-note');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('My Note');
      expect(res.body.content).toBe('Content here');
    });

    it('lists notes in results wrapper', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Note A', content: 'A' });
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Note B', content: 'B' });

      const res = await request(app).get('/api/projects/test/knowledge/notes');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
    });

    it('updates a note', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Original', content: 'Old' });

      const res = await request(app)
        .put('/api/projects/test/knowledge/notes/original')
        .send({ content: 'Updated' });
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Original');
      expect(res.body.content).toBe('Updated');

      const get = await request(app).get('/api/projects/test/knowledge/notes/original');
      expect(get.body.content).toBe('Updated');
    });

    it('deletes a note with 204', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'To Delete', content: 'Gone' });

      const res = await request(app).delete('/api/projects/test/knowledge/notes/to-delete');
      expect(res.status).toBe(204);

      const get = await request(app).get('/api/projects/test/knowledge/notes/to-delete');
      expect(get.status).toBe(404);
    });

    it('returns 404 for missing note', async () => {
      const res = await request(app).get('/api/projects/test/knowledge/notes/nonexistent');
      expect(res.status).toBe(404);
    });

    it('searches notes in results wrapper', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Auth tokens', content: 'JWT based auth' });

      const res = await request(app).get('/api/projects/test/knowledge/search?q=auth');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });

    it('validates create body', async () => {
      const res = await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ content: 'no title' });
      expect(res.status).toBe(400);
    });

    it('creates and lists relations', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Note A', content: 'A' });
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Note B', content: 'B' });

      const rel = await request(app)
        .post('/api/projects/test/knowledge/relations')
        .send({ fromId: 'note-a', toId: 'note-b', kind: 'relates_to', projectId: 'test' });
      expect(rel.status).toBe(201);
      expect(rel.body.fromId).toBe('note-a');
      expect(rel.body.toId).toBe('note-b');

      const list = await request(app).get('/api/projects/test/knowledge/notes/note-a/relations');
      expect(list.body.results.length).toBeGreaterThan(0);
    });
  });

  describe('Task CRUD', () => {
    it('creates a task', async () => {
      const res = await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Fix Bug', description: 'Fix the login bug' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBe('fix-bug');
      expect(res.body.title).toBe('Fix Bug');
    });

    it('gets a task', async () => {
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'My Task', description: 'Do something' });

      const res = await request(app).get('/api/projects/test/tasks/my-task');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('My Task');
    });

    it('lists tasks in results wrapper', async () => {
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Task 1', description: '' });
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Task 2', description: '' });

      const res = await request(app).get('/api/projects/test/tasks');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
    });

    it('moves a task via POST', async () => {
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Move Me', description: '' });

      const res = await request(app)
        .post('/api/projects/test/tasks/move-me/move')
        .send({ status: 'done' });
      expect(res.status).toBe(200);

      const get = await request(app).get('/api/projects/test/tasks/move-me');
      expect(get.body.status).toBe('done');
    });

    it('deletes a task with 204', async () => {
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Delete Me', description: '' });

      const res = await request(app).delete('/api/projects/test/tasks/delete-me');
      expect(res.status).toBe(204);

      const get = await request(app).get('/api/projects/test/tasks/delete-me');
      expect(get.status).toBe(404);
    });

    it('searches tasks in results wrapper', async () => {
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Fix auth', description: 'Auth is broken' });

      const res = await request(app).get('/api/projects/test/tasks/search?q=auth');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.results)).toBe(true);
    });
  });

  describe('Cross-graph proxy cleanup on delete', () => {
    it('delete note cleans up proxy in TaskGraph', async () => {
      // Create note and task
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Linked Note', content: 'A note' });
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Linked Task', description: 'A task' });

      // Link task → knowledge note
      await request(app)
        .post('/api/projects/test/tasks/links')
        .send({ fromId: 'linked-task', toId: 'linked-note', kind: 'references', targetGraph: 'knowledge', projectId: 'test' });

      // Verify proxy exists (project-scoped proxy ID)
      expect(project.taskGraph!.hasNode('@knowledge::test::linked-note')).toBe(true);

      // Delete note
      await request(app).delete('/api/projects/test/knowledge/notes/linked-note');

      // Proxy should be cleaned up
      expect(project.taskGraph!.hasNode('@knowledge::test::linked-note')).toBe(false);
    });

    it('delete task cleans up proxy in KnowledgeGraph', async () => {
      // Create note and task
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Another Note', content: 'A note' });
      await request(app)
        .post('/api/projects/test/tasks')
        .send({ title: 'Another Task', description: 'A task' });

      // Link note → task
      await request(app)
        .post('/api/projects/test/knowledge/relations')
        .send({ fromId: 'another-note', toId: 'another-task', kind: 'tracks', targetGraph: 'tasks', projectId: 'test' });

      // Verify proxy exists (project-scoped proxy ID)
      expect(project.knowledgeGraph!.hasNode('@tasks::test::another-task')).toBe(true);

      // Delete task
      await request(app).delete('/api/projects/test/tasks/another-task');

      // Proxy should be cleaned up
      expect(project.knowledgeGraph!.hasNode('@tasks::test::another-task')).toBe(false);
    });
  });

  describe('Graph export', () => {
    it('exports all graphs', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Export Test', content: 'Data' });

      const res = await request(app).get('/api/projects/test/graph');
      expect(res.status).toBe(200);
      expect(res.body.nodes).toBeDefined();
      expect(res.body.edges).toBeDefined();
      expect(res.body.nodes.length).toBeGreaterThan(0);
    });

    it('exports knowledge scope only', async () => {
      await request(app)
        .post('/api/projects/test/knowledge/notes')
        .send({ title: 'Scoped', content: 'Data' });

      const res = await request(app).get('/api/projects/test/graph?scope=knowledge');
      expect(res.status).toBe(200);
      expect(res.body.nodes.every((n: any) => n.graph === 'knowledge')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Validation & error handling
// ---------------------------------------------------------------------------

describe('Validation & error handling', () => {
  let app: express.Express;

  beforeEach(() => {
    const project = createTestProject();
    const manager = createTestManager(project);
    app = createRestApp(manager);
  });

  it('rejects note with title exceeding max length', async () => {
    const res = await request(app)
      .post('/api/projects/test/knowledge/notes')
      .send({ title: 'x'.repeat(501), content: 'Valid content' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Vv]alidation/);
  });

  it('rejects note with too many tags', async () => {
    const tags = Array.from({ length: 101 }, (_, i) => `tag-${i}`);
    const res = await request(app)
      .post('/api/projects/test/knowledge/notes')
      .send({ title: 'Valid Title', content: 'Content', tags });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Vv]alidation/);
  });

  it('rejects search with topK exceeding limit', async () => {
    const res = await request(app)
      .get('/api/projects/test/knowledge/search?q=test&topK=501');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Vv]alidation/);
  });

  it('rejects search with invalid searchMode', async () => {
    const res = await request(app)
      .get('/api/projects/test/knowledge/search?q=test&searchMode=bogus');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Vv]alidation/);
  });

  it('returns 404 for non-existent project', async () => {
    const res = await request(app)
      .get('/api/projects/no-such-project/knowledge/notes');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it('returns 404 for non-existent note', async () => {
    const res = await request(app)
      .get('/api/projects/test/knowledge/notes/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await request(app)
      .post('/api/projects/test/knowledge/notes')
      .set('Content-Type', 'application/json')
      .send('{ not valid json }');
    expect(res.status).toBe(400);
  });

  it('rejects path traversal in file info', async () => {
    const res = await request(app)
      .get('/api/projects/test/files/info?path=../../etc/passwd');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Ii]nvalid path/);
  });

  it('rejects linked query with invalid targetGraph', async () => {
    const res = await request(app)
      .get('/api/projects/test/knowledge/linked?targetGraph=invalid&targetNodeId=foo');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/[Vv]alidation/);
  });
});

// ---------------------------------------------------------------------------
// Attachment REST endpoints (require real temp dir for file I/O)
// ---------------------------------------------------------------------------

describe('Attachment REST endpoints', () => {
  let app: express.Express;
  let tmpDir: string;

  function createProjectWithDir(dir: string): ProjectInstance {
    const knowledgeGraph = createKnowledgeGraph();
    const fileIndexGraph = createFileIndexGraph();
    const taskGraph = createTaskGraph();
    const skillGraph = createSkillGraph();
    const ctx: GraphManagerContext = {
      markDirty: () => {},
      emit: () => {},
      projectId: 'test',
      projectDir: dir,
      author: '',
    };
    const ext = { knowledgeGraph, fileIndexGraph, taskGraph, skillGraph };

    return {
      id: 'test',
      config: {
        projectDir: dir,
        graphMemory: path.join(dir, '.graph-memory'),
        excludePattern: 'node_modules/**',
        chunkDepth: 4,
        maxTokensDefault: 4000,
        embedMaxChars: 2000,
        embedding: { ...TEST_EMBEDDING },
        graphConfigs: testGraphConfigs(),
        author: { name: '', email: '' },
      },
      knowledgeGraph,
      fileIndexGraph,
      taskGraph,
      skillGraph,
      knowledgeManager: new KnowledgeGraphManager(knowledgeGraph, embedFnPair(fakeEmbed), ctx, ext),
      fileIndexManager: new FileIndexGraphManager(fileIndexGraph, embedFnPair(fakeEmbed)),
      taskManager: new TaskGraphManager(taskGraph, embedFnPair(fakeEmbed), ctx, ext),
      skillManager: new SkillGraphManager(skillGraph, embedFnPair(fakeEmbed), ctx, ext),
      embedFns: {
        docs: embedFnPair(fakeEmbed),
        code: embedFnPair(fakeEmbed),
        knowledge: embedFnPair(fakeEmbed),
        tasks: embedFnPair(fakeEmbed),
        files: embedFnPair(fakeEmbed),
        skills: embedFnPair(fakeEmbed),
      },
      mutationQueue: new PromiseQueue(),
      dirty: false,
    };
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-attach-test-'));
    const project = createProjectWithDir(tmpDir);
    const emitter = new EventEmitter();
    const manager = Object.assign(emitter, {
      getProject: (id: string) => id === 'test' ? project : undefined,
      listProjects: () => ['test'],
      markDirty: () => {},
    }) as any as ProjectManager;
    app = createRestApp(manager);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Knowledge attachments', () => {
    const notesBase = '/api/projects/test/knowledge/notes';

    async function createNote() {
      const res = await request(app)
        .post(notesBase)
        .send({ title: 'Attach Note', content: 'For attachments' });
      expect(res.status).toBe(201);
      return res.body.id as string;
    }

    it('uploads an attachment and returns metadata', async () => {
      const noteId = await createNote();

      const res = await request(app)
        .post(`${notesBase}/${noteId}/attachments`)
        .attach('file', Buffer.from('test image data'), 'screenshot.png');

      expect(res.status).toBe(201);
      expect(res.body.filename).toBe('screenshot.png');
      expect(res.body.mimeType).toBe('image/png');
      expect(res.body.size).toBe(Buffer.from('test image data').length);
      expect(typeof res.body.addedAt).toBe('number');
    });

    it('lists attachments for a note', async () => {
      const noteId = await createNote();

      await request(app)
        .post(`${notesBase}/${noteId}/attachments`)
        .attach('file', Buffer.from('aaa'), 'a.txt');
      await request(app)
        .post(`${notesBase}/${noteId}/attachments`)
        .attach('file', Buffer.from('bbb'), 'b.txt');

      const res = await request(app).get(`${notesBase}/${noteId}/attachments`);
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
      const filenames = res.body.results.map((a: any) => a.filename).sort();
      expect(filenames).toEqual(['a.txt', 'b.txt']);
    });

    it('downloads an attachment with correct content-type', async () => {
      const noteId = await createNote();
      const content = 'hello world';

      await request(app)
        .post(`${notesBase}/${noteId}/attachments`)
        .attach('file', Buffer.from(content), 'readme.txt');

      const res = await request(app)
        .get(`${notesBase}/${noteId}/attachments/readme.txt`)
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => { data += chunk; });
          res.on('end', () => cb(null, data));
        });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.body).toBe(content);
    });

    it('deletes an attachment with 204', async () => {
      const noteId = await createNote();

      await request(app)
        .post(`${notesBase}/${noteId}/attachments`)
        .attach('file', Buffer.from('gone'), 'temp.txt');

      const del = await request(app).delete(`${notesBase}/${noteId}/attachments/temp.txt`);
      expect(del.status).toBe(204);

      const list = await request(app).get(`${notesBase}/${noteId}/attachments`);
      expect(list.body.results).toHaveLength(0);
    });

    it('returns 404 when downloading from non-existent note', async () => {
      const res = await request(app).get(`${notesBase}/no-such-note/attachments/file.txt`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when downloading non-existent attachment', async () => {
      const noteId = await createNote();
      const res = await request(app).get(`${notesBase}/${noteId}/attachments/missing.txt`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when deleting non-existent attachment', async () => {
      const noteId = await createNote();
      const res = await request(app).delete(`${notesBase}/${noteId}/attachments/missing.txt`);
      expect(res.status).toBe(404);
    });

    it('returns 400 when no file is provided', async () => {
      const noteId = await createNote();
      const res = await request(app).post(`${notesBase}/${noteId}/attachments`);
      expect(res.status).toBe(400);
    });

    it('returns empty list for note with no attachments', async () => {
      const noteId = await createNote();
      const res = await request(app).get(`${notesBase}/${noteId}/attachments`);
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });
  });

  describe('Task attachments', () => {
    const tasksBase = '/api/projects/test/tasks';

    async function createTask() {
      const res = await request(app)
        .post(tasksBase)
        .send({ title: 'Attach Task', description: 'For attachments' });
      expect(res.status).toBe(201);
      return res.body.id as string;
    }

    it('uploads an attachment and returns metadata', async () => {
      const taskId = await createTask();

      const res = await request(app)
        .post(`${tasksBase}/${taskId}/attachments`)
        .attach('file', Buffer.from('pdf data'), 'report.pdf');

      expect(res.status).toBe(201);
      expect(res.body.filename).toBe('report.pdf');
      expect(res.body.mimeType).toBe('application/pdf');
      expect(res.body.size).toBe(Buffer.from('pdf data').length);
      expect(typeof res.body.addedAt).toBe('number');
    });

    it('lists attachments for a task', async () => {
      const taskId = await createTask();

      await request(app)
        .post(`${tasksBase}/${taskId}/attachments`)
        .attach('file', Buffer.from('x'), 'x.txt');
      await request(app)
        .post(`${tasksBase}/${taskId}/attachments`)
        .attach('file', Buffer.from('y'), 'y.png');

      const res = await request(app).get(`${tasksBase}/${taskId}/attachments`);
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(2);
      const filenames = res.body.results.map((a: any) => a.filename).sort();
      expect(filenames).toEqual(['x.txt', 'y.png']);
    });

    it('downloads an attachment with correct content-type', async () => {
      const taskId = await createTask();
      const content = '{"key":"value"}';

      await request(app)
        .post(`${tasksBase}/${taskId}/attachments`)
        .attach('file', Buffer.from(content), 'data.json');

      const res = await request(app).get(`${tasksBase}/${taskId}/attachments/data.json`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.body).toEqual({ key: 'value' });
    });

    it('deletes an attachment with 204', async () => {
      const taskId = await createTask();

      await request(app)
        .post(`${tasksBase}/${taskId}/attachments`)
        .attach('file', Buffer.from('bye'), 'remove-me.txt');

      const del = await request(app).delete(`${tasksBase}/${taskId}/attachments/remove-me.txt`);
      expect(del.status).toBe(204);

      const list = await request(app).get(`${tasksBase}/${taskId}/attachments`);
      expect(list.body.results).toHaveLength(0);
    });

    it('returns 404 when downloading from non-existent task', async () => {
      const res = await request(app).get(`${tasksBase}/no-such-task/attachments/file.txt`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when downloading non-existent attachment', async () => {
      const taskId = await createTask();
      const res = await request(app).get(`${tasksBase}/${taskId}/attachments/missing.txt`);
      expect(res.status).toBe(404);
    });

    it('returns 404 when deleting non-existent attachment', async () => {
      const taskId = await createTask();
      const res = await request(app).delete(`${tasksBase}/${taskId}/attachments/missing.txt`);
      expect(res.status).toBe(404);
    });

    it('returns 400 when no file is provided', async () => {
      const taskId = await createTask();
      const res = await request(app).post(`${tasksBase}/${taskId}/attachments`);
      expect(res.status).toBe(400);
    });

    it('returns empty list for task with no attachments', async () => {
      const taskId = await createTask();
      const res = await request(app).get(`${tasksBase}/${taskId}/attachments`);
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Auth & ACL tests
// ---------------------------------------------------------------------------

describe('REST API — Auth & ACL', () => {
  let app: ReturnType<typeof createRestApp>;

  beforeEach(() => {
    const project = createTestProject();
    const manager = {
      getProject: (id: string) => id === 'test' ? project : undefined,
      listProjects: () => ['test'],
      listWorkspaces: () => [],
      getWorkspace: () => undefined,
    } as unknown as ProjectManager;

    app = createRestApp(manager, {
      serverConfig: {
        host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
        modelsDir: '/tmp/models',
        embedding: { ...TEST_EMBEDDING },
        defaultAccess: 'deny',
        access: { admin: 'rw' },
        accessTokenTtl: '15m', refreshTokenTtl: '7d',
      },
      users: {
        admin: { name: 'Admin', email: 'admin@test.com', apiKey: 'key-admin' },
        reader: { name: 'Reader', email: 'reader@test.com', apiKey: 'key-reader' },
      },
    });
  });

  it('rejects invalid API key with 401', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer bad-key');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid API key/);
  });

  it('allows anonymous when no Bearer header (uses defaultAccess)', async () => {
    // defaultAccess is deny, so anonymous gets denied on graph endpoints
    const res = await request(app).get('/api/projects/test/knowledge/notes');
    expect(res.status).toBe(403);
  });

  it('allows authenticated user with rw access', async () => {
    const res = await request(app)
      .get('/api/projects/test/knowledge/notes')
      .set('Authorization', 'Bearer key-admin');
    expect(res.status).toBe(200);
  });

  it('allows read for user with r access, blocks write', async () => {
    // Give reader read access at server level
    const project = createTestProject();
    const manager = {
      getProject: (id: string) => id === 'test' ? project : undefined,
      listProjects: () => ['test'],
      listWorkspaces: () => [],
      getWorkspace: () => undefined,
    } as unknown as ProjectManager;

    const authApp = createRestApp(manager, {
      serverConfig: {
        host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
        modelsDir: '/tmp/models',
        embedding: { ...TEST_EMBEDDING },
        defaultAccess: 'deny',
        access: { reader: 'r' },
        accessTokenTtl: '15m', refreshTokenTtl: '7d',
      },
      users: {
        reader: { name: 'Reader', email: 'reader@test.com', apiKey: 'key-reader' },
      },
    });

    // Read should work
    const readRes = await request(authApp)
      .get('/api/projects/test/knowledge/notes')
      .set('Authorization', 'Bearer key-reader');
    expect(readRes.status).toBe(200);

    // Write should be denied
    const writeRes = await request(authApp)
      .post('/api/projects/test/knowledge/notes')
      .set('Authorization', 'Bearer key-reader')
      .send({ title: 'Test', content: 'test' });
    expect(writeRes.status).toBe(403);
    expect(writeRes.body.error).toMatch(/Read-only/);
  });

  it('includes access info in projects list', async () => {
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', 'Bearer key-admin');
    expect(res.status).toBe(200);
    const proj = res.body.results[0];
    expect(proj.graphs.knowledge.access).toBe('rw');
    expect(proj.graphs.knowledge.enabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Embedding API tests
// ---------------------------------------------------------------------------

import { loadModel, resetEmbedder } from '@/lib/embedder';

describe('REST API — Embedding API', () => {
  let app: ReturnType<typeof createRestApp>;
  const EMBED_MODEL_NAME = '__test_embed__';

  beforeEach(async () => {
    resetEmbedder();
    await loadModel(
      { model: 'test', pooling: 'mean', normalize: true, queryPrefix: '', documentPrefix: '', batchSize: 1 },
      '/tmp/models', 4000, EMBED_MODEL_NAME,
    );

    const project = createTestProject();
    const manager = {
      getProject: (id: string) => id === 'test' ? project : undefined,
      listProjects: () => ['test'],
      listWorkspaces: () => [],
      getWorkspace: () => undefined,
    } as unknown as ProjectManager;

    app = createRestApp(manager, {
      serverConfig: {
        host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
        modelsDir: '/tmp/models',
        embedding: { ...TEST_EMBEDDING },
        embeddingApi: { enabled: true, apiKey: 'emb-secret' },
        defaultAccess: 'rw',
        accessTokenTtl: '15m', refreshTokenTtl: '7d',
      },
      embeddingApiModelName: EMBED_MODEL_NAME,
    });
  });

  afterEach(() => {
    resetEmbedder();
  });

  it('returns embeddings for valid request', async () => {
    const res = await request(app)
      .post('/api/embed')
      .set('Authorization', 'Bearer emb-secret')
      .send({ texts: ['hello', 'world'] });
    expect(res.status).toBe(200);
    expect(res.body.embeddings).toHaveLength(2);
    expect(Array.isArray(res.body.embeddings[0])).toBe(true);
    expect(res.body.embeddings[0].length).toBeGreaterThan(0);
  });

  it('rejects missing texts with correct auth', async () => {
    const res = await request(app)
      .post('/api/embed')
      .set('Authorization', 'Bearer emb-secret')
      .send({});
    expect(res.status).toBe(400);
  });

  it('rejects invalid API key', async () => {
    const res = await request(app)
      .post('/api/embed')
      .set('Authorization', 'Bearer wrong-key')
      .send({ texts: ['test'] });
    expect(res.status).toBe(401);
  });

  it('allows request with correct API key', async () => {
    const res = await request(app)
      .post('/api/embed')
      .set('Authorization', 'Bearer emb-secret')
      .send({ texts: ['test'] });
    expect(res.status).toBe(200);
    expect(res.body.embeddings).toHaveLength(1);
  });

  it('rejects request without auth when apiKey is configured', async () => {
    const res = await request(app)
      .post('/api/embed')
      .send({ texts: ['test'] });
    expect(res.status).toBe(401);
  });

  it('not mounted when embeddingApi is not enabled', async () => {
    const project = createTestProject();
    const manager = {
      getProject: (id: string) => id === 'test' ? project : undefined,
      listProjects: () => ['test'],
      listWorkspaces: () => [],
      getWorkspace: () => undefined,
    } as unknown as ProjectManager;

    const noEmbedApp = createRestApp(manager, {
      serverConfig: {
        host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
        modelsDir: '/tmp/models',
        embedding: { ...TEST_EMBEDDING },
        defaultAccess: 'rw',
        accessTokenTtl: '15m', refreshTokenTtl: '7d',
      },
    });
    const res = await request(noEmbedApp).post('/api/embed').send({ texts: ['test'] });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// JWT Cookie Auth tests
// ---------------------------------------------------------------------------

import { hashPassword } from '@/lib/jwt';

describe('REST API — JWT Cookie Auth', () => {
  let app: ReturnType<typeof createRestApp>;
  const JWT_SECRET = 'test-jwt-secret-key';
  let adminPasswordHash: string;

  beforeAll(async () => {
    adminPasswordHash = await hashPassword('admin-pass');
  });

  beforeEach(() => {
    const project = createTestProject();
    const manager = {
      getProject: (id: string) => id === 'test' ? project : undefined,
      listProjects: () => ['test'],
      listWorkspaces: () => [],
      getWorkspace: () => undefined,
    } as unknown as ProjectManager;

    app = createRestApp(manager, {
      serverConfig: {
        host: '127.0.0.1', port: 3000, sessionTimeout: 1800,
        modelsDir: '/tmp/models',
        embedding: { ...TEST_EMBEDDING },
        defaultAccess: 'deny',
        access: { admin: 'rw' },
        jwtSecret: JWT_SECRET,
        accessTokenTtl: '15m', refreshTokenTtl: '7d',
      },
      users: {
        admin: { name: 'Admin', email: 'admin@test.com', apiKey: 'key-admin', passwordHash: adminPasswordHash },
        nopass: { name: 'NoPass', email: 'nopass@test.com', apiKey: 'key-nopass' },
      },
    });
  });

  it('login with valid email+password returns 200 and sets cookies', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'admin-pass' });
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('admin');
    expect(res.body.name).toBe('Admin');
    // Should have Set-Cookie headers
    const cookies: string[] = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie'] : [res.headers['set-cookie']].filter(Boolean);
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.some(c => c.startsWith('mgm_access='))).toBe(true);
    expect(cookies.some(c => c.startsWith('mgm_refresh='))).toBe(true);
  });

  it('login with wrong password returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid credentials/);
  });

  it('login with unknown email returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'unknown@test.com', password: 'test' });
    expect(res.status).toBe(401);
  });

  it('login with user without passwordHash returns 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nopass@test.com', password: 'test' });
    expect(res.status).toBe(401);
  });

  it('login with missing fields returns 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    expect(res.status).toBe(400);
  });

  it('cookie auth grants access to protected endpoints', async () => {
    // Login first
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'admin-pass' });
    const rawCookies = loginRes.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies) ? rawCookies : [rawCookies].filter(Boolean);

    // Use cookies to access protected endpoint
    const res = await request(app)
      .get('/api/projects/test/knowledge/notes')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
  });

  it('auth/status returns authenticated with valid cookie', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'admin-pass' });
    const rawCookies = loginRes.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies) ? rawCookies : [rawCookies].filter(Boolean);

    const res = await request(app)
      .get('/api/auth/status')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.userId).toBe('admin');
  });

  it('auth/status returns unauthenticated without cookie', async () => {
    const res = await request(app).get('/api/auth/status');
    expect(res.status).toBe(200);
    expect(res.body.required).toBe(true);
    expect(res.body.authenticated).toBe(false);
  });

  it('refresh endpoint renews access token', async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@test.com', password: 'admin-pass' });
    const rawCookies = loginRes.headers['set-cookie'];
    const cookies: string[] = Array.isArray(rawCookies) ? rawCookies : [rawCookies].filter(Boolean);

    // Extract refresh cookie only
    const refreshCookie = cookies.find(c => c.startsWith('mgm_refresh='))!;

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', [refreshCookie]);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe('admin');
    // Should set new cookies
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('refresh rejects without refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('logout clears cookies', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const cookies = res.headers['set-cookie'];
    // Cookies should be cleared (empty value or expired)
    expect(cookies).toBeDefined();
  });

  it('Bearer apiKey still works alongside cookie auth', async () => {
    const res = await request(app)
      .get('/api/projects/test/knowledge/notes')
      .set('Authorization', 'Bearer key-admin');
    expect(res.status).toBe(200);
  });
});
