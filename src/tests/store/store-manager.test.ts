import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import { SqliteStore } from '@/store';
import { StoreManager } from '@/lib/store-manager';
import { seedEmbedding } from './helpers';

async function fakeEmbed(text: string): Promise<number[]> {
  return seedEmbedding(text.length);
}

describe('StoreManager', () => {
  let store: SqliteStore;
  let manager: StoreManager;
  let emitter: EventEmitter;
  let projectDir: string;
  let cleanup: () => void;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'orch-test-'));
    const dbPath = join(dir, 'test.db');
    projectDir = mkdtempSync(join(tmpdir(), 'orch-project-'));

    store = new SqliteStore();
    store.open({ dbPath });

    const project = store.projects.create({ slug: 'test', name: 'Test', directory: projectDir });
    emitter = new EventEmitter();

    manager = new StoreManager({
      store,
      projectId: project.id,
      projectDir,
      embedFn: fakeEmbed,
      emitter,
    });

    cleanup = () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      rmSync(projectDir, { recursive: true, force: true });
    };
  });

  afterEach(() => cleanup());

  // =========================================================================
  // Notes
  // =========================================================================

  describe('notes', () => {
    it('creates a note with embedding and mirror', async () => {
      const events: unknown[] = [];
      emitter.on('note:created', (d) => events.push(d));

      const record = await manager.createNote({ title: 'Hello', content: 'World', tags: ['test'] });

      expect(record.title).toBe('Hello');
      expect(record.content).toBe('World');
      expect(record.tags).toEqual(['test']);
      expect(events.length).toBe(1);

      // Mirror written
      expect(existsSync(join(projectDir, '.notes', record.slug, 'events.jsonl'))).toBe(true);
      expect(existsSync(join(projectDir, '.notes', record.slug, 'content.md'))).toBe(true);
    });

    it('updates a note with re-embedding on content change', async () => {
      const record = await manager.createNote({ title: 'Original', content: 'Content' });
      const updated = await manager.updateNote(record.id, { content: 'New content' });

      expect(updated.content).toBe('New content');
      expect(updated.version).toBe(record.version + 1);
    });

    it('deletes a note and removes mirror dir', async () => {
      const record = await manager.createNote({ title: 'ToDelete', content: '' });
      const mirrorDir = join(projectDir, '.notes', record.slug);
      expect(existsSync(mirrorDir)).toBe(true);

      manager.deleteNote(record.id);

      expect(manager.getNote(record.id)).toBeNull();
      expect(existsSync(mirrorDir)).toBe(false);
    });

    it('searches notes', async () => {
      await manager.createNote({ title: 'Alpha', content: 'First note' });
      await manager.createNote({ title: 'Beta', content: 'Second note' });

      const results = await manager.searchNotes({ text: 'alpha', searchMode: 'keyword' });
      expect(results.length).toBe(1);
    });
  });

  // =========================================================================
  // Tasks
  // =========================================================================

  describe('tasks', () => {
    it('creates a task with mirror', async () => {
      const record = await manager.createTask({
        title: 'Fix bug', description: 'Urgent', status: 'todo', priority: 'high',
      });

      expect(record.status).toBe('todo');
      expect(record.priority).toBe('high');
      expect(existsSync(join(projectDir, '.tasks', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('moves a task', async () => {
      const record = await manager.createTask({
        title: 'Task', description: '', status: 'backlog', priority: 'medium',
      });
      const moved = manager.moveTask(record.id, 'done');

      expect(moved.status).toBe('done');
      expect(moved.completedAt).not.toBeNull();
    });

    it('reorders a task with mirror update', async () => {
      const record = await manager.createTask({
        title: 'Reorder me', description: '', status: 'todo', priority: 'medium',
      });
      const events: unknown[] = [];
      emitter.on('task:updated', (d) => events.push(d));

      const reordered = manager.reorderTask(record.id, 5000);

      expect(reordered.order).toBe(5000);
      expect(events.length).toBe(1);
    });

    it('bulk deletes tasks and removes mirror dirs', async () => {
      const t1 = await manager.createTask({ title: 'A', description: '' });
      const t2 = await manager.createTask({ title: 'B', description: '' });

      expect(existsSync(join(projectDir, '.tasks', t1.slug))).toBe(true);
      expect(existsSync(join(projectDir, '.tasks', t2.slug))).toBe(true);

      const events: unknown[] = [];
      emitter.on('task:bulk_deleted', (d) => events.push(d));

      const count = manager.bulkDeleteTasks([t1.id, t2.id]);
      expect(count).toBe(2);
      expect(existsSync(join(projectDir, '.tasks', t1.slug))).toBe(false);
      expect(existsSync(join(projectDir, '.tasks', t2.slug))).toBe(false);
      expect(events.length).toBe(1);
    });

    it('bulk moves tasks with mirror updates', async () => {
      const t1 = await manager.createTask({ title: 'A', description: '', status: 'todo' });
      const t2 = await manager.createTask({ title: 'B', description: '', status: 'todo' });

      const events: unknown[] = [];
      emitter.on('task:bulk_moved', (d) => events.push(d));

      const count = manager.bulkMoveTasks([t1.id, t2.id], 'done');
      expect(count).toBe(2);
      expect(events.length).toBe(1);

      // Verify tasks actually moved
      expect(manager.getTask(t1.id)!.status).toBe('done');
      expect(manager.getTask(t2.id)!.status).toBe('done');
    });

    it('bulk updates priority with mirror updates', async () => {
      const t1 = await manager.createTask({ title: 'A', description: '', priority: 'low' });
      const t2 = await manager.createTask({ title: 'B', description: '', priority: 'low' });

      const events: unknown[] = [];
      emitter.on('task:bulk_priority', (d) => events.push(d));

      const count = manager.bulkPriorityTasks([t1.id, t2.id], 'critical');
      expect(count).toBe(2);
      expect(events.length).toBe(1);

      expect(manager.getTask(t1.id)!.priority).toBe('critical');
      expect(manager.getTask(t2.id)!.priority).toBe('critical');
    });

    it('mirror writer resolves assigneeId → slug in task.md frontmatter', async () => {
      // Seed a team member directly via the store
      const member = store.team.create({ slug: 'qa-bot', name: 'QA Bot' });

      const record = await manager.createTask({
        title: 'Mirrored',
        description: '',
        priority: 'medium',
        assigneeId: member.id,
      });

      // Read the task.md snapshot and check its frontmatter
      const fs = await import('fs');
      const path = await import('path');
      const taskMd = fs.readFileSync(path.join(projectDir, '.tasks', record.slug, 'task.md'), 'utf-8');
      // Frontmatter is YAML — quoted or unquoted slug both acceptable.
      expect(taskMd).toMatch(/^assignee:\s*['"]?qa-bot['"]?\s*$/m);
    });

    it('mirror writer falls back to null when assigneeId references missing member', async () => {
      // Create a member, use it, then delete the row — leaving the task with an orphan FK
      const member = store.team.create({ slug: 'temp', name: 'Temp' });
      const record = await manager.createTask({
        title: 'Orphaned',
        description: '',
        priority: 'low',
        assigneeId: member.id,
      });
      store.team.delete(member.id);

      // Trigger a re-mirror via update — buildMirrorTaskAttrs should now write null
      await manager.updateTask(record.id, { description: 'touch' });

      const fs = await import('fs');
      const path = await import('path');
      const taskMd = fs.readFileSync(path.join(projectDir, '.tasks', record.slug, 'task.md'), 'utf-8');
      expect(taskMd).toMatch(/^assignee:\s*(null|~)\s*$/m);
    });

    it('importTaskFromFile resolves assignee slug → numeric assigneeId', async () => {
      const member = store.team.create({ slug: 'imported-bot', name: 'Imported Bot' });

      // Construct a parsed task as the file-mirror watcher would have produced
      const parsed = {
        id: 'mirror-import-test',
        title: 'Imported Task',
        description: 'from mirror',
        status: 'todo' as const,
        priority: 'medium' as const,
        tags: [],
        dueDate: null,
        estimate: null,
        completedAt: null,
        assignee: 'imported-bot',
        createdAt: null,
        updatedAt: null,
        version: null,
        createdBy: null,
        updatedBy: null,
        relations: [],
        attachments: [],
      };

      await manager.importTaskFromFile(parsed);

      const created = manager.getTaskBySlug('mirror-import-test');
      expect(created).not.toBeNull();
      expect(created!.assigneeId).toBe(member.id);
    });

    it('importTaskFromFile sets assigneeId=null when slug is unknown', async () => {
      const parsed = {
        id: 'mirror-import-orphan',
        title: 'Orphan Import',
        description: '',
        status: 'todo' as const,
        priority: 'low' as const,
        tags: [],
        dueDate: null,
        estimate: null,
        completedAt: null,
        assignee: 'no-such-slug',
        createdAt: null,
        updatedAt: null,
        version: null,
        createdBy: null,
        updatedBy: null,
        relations: [],
        attachments: [],
      };

      await manager.importTaskFromFile(parsed);

      const created = manager.getTaskBySlug('mirror-import-orphan');
      expect(created).not.toBeNull();
      expect(created!.assigneeId).toBeNull();
    });
  });

  // =========================================================================
  // Epics
  // =========================================================================

  describe('epics', () => {
    it('creates an epic with mirror', async () => {
      const record = await manager.createEpic({
        title: 'Release v2', description: 'Major release',
      });

      expect(record.title).toBe('Release v2');
      expect(record.status).toBe('open');
      expect(existsSync(join(projectDir, '.epics', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('links and unlinks a task to an epic', async () => {
      const epic = await manager.createEpic({ title: 'Epic', description: '' });
      const task = await manager.createTask({ title: 'Task', description: '' });

      manager.linkTaskToEpic(epic.id, task.id);

      const epicDetail = manager.getEpic(epic.id)!;
      expect(epicDetail.progress.total).toBe(1);

      manager.unlinkTaskFromEpic(epic.id, task.id);
      const epicAfter = manager.getEpic(epic.id)!;
      expect(epicAfter.progress.total).toBe(0);
    });
  });

  // =========================================================================
  // Skills
  // =========================================================================

  describe('skills', () => {
    it('creates a skill with mirror', async () => {
      const record = await manager.createSkill({
        title: 'Deploy', description: 'Deploy to prod',
        steps: ['build', 'push'], triggers: ['on merge'],
      });

      expect(record.steps).toEqual(['build', 'push']);
      expect(existsSync(join(projectDir, '.skills', record.slug, 'events.jsonl'))).toBe(true);
    });

    it('bumps skill usage', async () => {
      const record = await manager.createSkill({ title: 'Skill', description: '' });
      expect(record.usageCount).toBe(0);

      manager.bumpSkillUsage(record.id);

      const updated = manager.getSkill(record.id)!;
      expect(updated.usageCount).toBe(1);
      expect(updated.lastUsedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // Edges
  // =========================================================================

  describe('edges', () => {
    it('creates and lists edges', async () => {
      const note = await manager.createNote({ title: 'Note', content: '' });
      const task = await manager.createTask({ title: 'Task', description: '' });

      manager.createEdge({
        fromGraph: 'knowledge', fromId: note.id,
        toGraph: 'tasks', toId: task.id,
        kind: 'relates_to',
      });

      const edges = manager.listEdges({ fromGraph: 'knowledge', fromId: note.id });
      expect(edges.length).toBe(1);
      expect(edges[0].toId).toBe(task.id);
    });
  });

  // =========================================================================
  // Mirror ↔ relations round-trip
  //
  // Regression coverage for the silent data-loss bug where relations created
  // through StoreManager (UI/REST/MCP) were never written to the markdown
  // mirror, and any subsequent entity update wiped existing relations from
  // the file frontmatter.
  // =========================================================================

  describe('mirror relations', () => {
    function readNoteMd(slug: string): string {
      return readFileSync(join(projectDir, '.notes', slug, 'note.md'), 'utf-8');
    }
    function readTaskMd(slug: string): string {
      return readFileSync(join(projectDir, '.tasks', slug, 'task.md'), 'utf-8');
    }
    function readSkillMd(slug: string): string {
      return readFileSync(join(projectDir, '.skills', slug, 'skill.md'), 'utf-8');
    }

    it('createEdge writes outgoing relation to source note.md frontmatter', async () => {
      const noteA = await manager.createNote({ title: 'A', content: '' });
      const noteB = await manager.createNote({ title: 'B', content: '' });

      // Newly-created note has no relations in frontmatter.
      expect(readNoteMd(noteA.slug)).not.toMatch(/^relations:/m);

      manager.createEdge({
        fromGraph: 'knowledge', fromId: noteA.id,
        toGraph: 'knowledge', toId: noteB.id,
        kind: 'related_to',
      });

      const md = readNoteMd(noteA.slug);
      expect(md).toMatch(/^relations:/m);
      expect(md).toContain(`to: ${noteB.slug}`);
      expect(md).toContain('kind: related_to');
    });

    it('updateNote preserves existing relations in frontmatter', async () => {
      const noteA = await manager.createNote({ title: 'A', content: 'old body' });
      const noteB = await manager.createNote({ title: 'B', content: '' });
      manager.createEdge({
        fromGraph: 'knowledge', fromId: noteA.id,
        toGraph: 'knowledge', toId: noteB.id,
        kind: 'related_to',
      });

      // Now update unrelated content — relations must survive.
      await manager.updateNote(noteA.id, { content: 'new body' });

      const md = readNoteMd(noteA.slug);
      expect(md).toContain(`to: ${noteB.slug}`);
      expect(md).toContain('kind: related_to');
    });

    it('deleteEdge removes the relation from note.md frontmatter', async () => {
      const noteA = await manager.createNote({ title: 'A', content: '' });
      const noteB = await manager.createNote({ title: 'B', content: '' });
      const edge = {
        fromGraph: 'knowledge' as const, fromId: noteA.id,
        toGraph: 'knowledge' as const, toId: noteB.id,
        kind: 'related_to',
      };
      manager.createEdge(edge);
      expect(readNoteMd(noteA.slug)).toContain(`to: ${noteB.slug}`);

      manager.deleteEdge(edge);

      expect(readNoteMd(noteA.slug)).not.toContain(`to: ${noteB.slug}`);
    });

    it('cross-graph link writes graph: field; same-graph omits it', async () => {
      const note = await manager.createNote({ title: 'N', content: '' });
      const task = await manager.createTask({ title: 'T', description: '' });
      const otherNote = await manager.createNote({ title: 'O', content: '' });

      // Cross-graph: knowledge → tasks
      manager.createEdge({
        fromGraph: 'knowledge', fromId: note.id,
        toGraph: 'tasks', toId: task.id,
        kind: 'relates_to',
      });
      // Same-graph: knowledge → knowledge
      manager.createEdge({
        fromGraph: 'knowledge', fromId: note.id,
        toGraph: 'knowledge', toId: otherNote.id,
        kind: 'depends_on',
      });

      const md = readNoteMd(note.slug);
      // The cross-graph entry (kind: relates_to → task) must carry `graph: tasks`.
      const relatesBlock = md.match(/- to: [^\n]+\n\s*kind: relates_to(?:\n\s*graph: [^\n]+)?/);
      expect(relatesBlock).not.toBeNull();
      expect(relatesBlock![0]).toContain('graph: tasks');
      // The same-graph entry (kind: depends_on → other note) must NOT carry a `graph:` field.
      const dependsBlock = md.match(/- to: [^\n]+\n\s*kind: depends_on(?:\n\s*graph: [^\n]+)?/);
      expect(dependsBlock).not.toBeNull();
      expect(dependsBlock![0]).not.toContain('graph:');
    });

    it('task createEdge writes outgoing relation to task.md frontmatter', async () => {
      const task = await manager.createTask({ title: 'T', description: '' });
      const note = await manager.createNote({ title: 'N', content: '' });

      manager.createEdge({
        fromGraph: 'tasks', fromId: task.id,
        toGraph: 'knowledge', toId: note.id,
        kind: 'relates_to',
      });

      const md = readTaskMd(task.slug);
      expect(md).toMatch(/^relations:/m);
      expect(md).toContain(`to: ${note.slug}`);
      expect(md).toContain('graph: knowledge');
    });

    it('skill createEdge writes outgoing relation to skill.md frontmatter', async () => {
      const skill = await manager.createSkill({ title: 'S', description: '' });
      const note = await manager.createNote({ title: 'N', content: '' });

      manager.createEdge({
        fromGraph: 'skills', fromId: skill.id,
        toGraph: 'knowledge', toId: note.id,
        kind: 'related_to',
      });

      const md = readSkillMd(skill.slug);
      expect(md).toMatch(/^relations:/m);
      expect(md).toContain(`to: ${note.slug}`);
      expect(md).toContain('graph: knowledge');
    });

    it('updateTask preserves existing relations', async () => {
      const task = await manager.createTask({ title: 'T', description: 'old' });
      const note = await manager.createNote({ title: 'N', content: '' });
      manager.createEdge({
        fromGraph: 'tasks', fromId: task.id,
        toGraph: 'knowledge', toId: note.id,
        kind: 'relates_to',
      });

      await manager.updateTask(task.id, { description: 'new' });

      expect(readTaskMd(task.slug)).toContain(`to: ${note.slug}`);
    });

    it('updateSkill preserves existing relations', async () => {
      const skill = await manager.createSkill({ title: 'S', description: 'old' });
      const note = await manager.createNote({ title: 'N', content: '' });
      manager.createEdge({
        fromGraph: 'skills', fromId: skill.id,
        toGraph: 'knowledge', toId: note.id,
        kind: 'related_to',
      });

      await manager.updateSkill(skill.id, { description: 'new' });

      expect(readSkillMd(skill.slug)).toContain(`to: ${note.slug}`);
    });
  });

  // =========================================================================
  // enrichRelations — used by REST /relations endpoints to attach human-readable
  // titles to edge endpoints. Regression coverage for the bigint-vs-number Map
  // key bug: SQLite returns INTEGER columns as BigInt under safeIntegers(true),
  // and the previous resolveTitles implementation kept those bigint keys in the
  // result Map, so callers doing Map.get(numericId) silently missed every row
  // and fell back to String(targetId) — turning the Relations panel into a
  // wall of raw IDs.
  //
  // Also covers the previously-missing 'tags' graph case (auto-edges from
  // indexer-managed tag nodes to tagged entities).
  // =========================================================================

  describe('enrichRelations (title resolution)', () => {
    it('resolves knowledge titles for cross-note edges', async () => {
      const a = await manager.createNote({ title: 'Alpha title', content: '' });
      const b = await manager.createNote({ title: 'Beta title', content: '' });
      manager.createEdge({
        fromGraph: 'knowledge', fromId: a.id,
        toGraph: 'knowledge', toId: b.id,
        kind: 'depends_on',
      });

      const edges = [
        ...manager.findOutgoingEdges('knowledge', a.id),
        ...manager.findIncomingEdges('knowledge', a.id),
      ];
      const enriched = manager.enrichRelations('knowledge', a.id, edges);

      expect(enriched).toHaveLength(1);
      expect(enriched[0].targetId).toBe(b.id);
      expect(enriched[0].targetGraph).toBe('knowledge');
      expect(enriched[0].title).toBe('Beta title');
      expect(enriched[0].direction).toBe('out');
    });

    it('resolves cross-graph titles (knowledge → tasks → skills)', async () => {
      const note = await manager.createNote({ title: 'N title', content: '' });
      const task = await manager.createTask({ title: 'T title', description: '' });
      const skill = await manager.createSkill({ title: 'S title', description: '' });
      manager.createEdge({ fromGraph: 'knowledge', fromId: note.id, toGraph: 'tasks', toId: task.id, kind: 'relates_to' });
      manager.createEdge({ fromGraph: 'knowledge', fromId: note.id, toGraph: 'skills', toId: skill.id, kind: 'uses' });

      const edges = manager.findOutgoingEdges('knowledge', note.id);
      const enriched = manager.enrichRelations('knowledge', note.id, edges);

      const taskRel = enriched.find(e => e.targetGraph === 'tasks');
      const skillRel = enriched.find(e => e.targetGraph === 'skills');
      expect(taskRel?.title).toBe('T title');
      expect(skillRel?.title).toBe('S title');
    });

    it('filters out auto-tagged edges so the Relations panel stays clean', async () => {
      // Notes with tags get auto-created `tags → knowledge` edges (kind: 'tagged').
      // Tags already render in their own sidebar section; the Relations panel
      // should not duplicate them.
      const note = await manager.createNote({ title: 'Tagged note', content: '', tags: ['alpha', 'beta'] });

      const edges = [
        ...manager.findOutgoingEdges('knowledge', note.id),
        ...manager.findIncomingEdges('knowledge', note.id),
      ];
      // Sanity check: the raw edge layer DOES expose the auto-tagged edges
      // (they're real and findable for MCP/LLM agents).
      const rawTagEdges = edges.filter(e => e.kind === 'tagged' && e.fromGraph === 'tags');
      expect(rawTagEdges.length).toBeGreaterThanOrEqual(2);

      // But enrichRelations strips them so the Relations panel only shows
      // user-created relations.
      const enriched = manager.enrichRelations('knowledge', note.id, edges);
      expect(enriched.filter(e => e.targetGraph === 'tags')).toEqual([]);
    });

    it('resolves tag node names directly via resolveTitles (for non-panel callers)', async () => {
      // The 'tags' case in resolveTitles must still resolve names — only the
      // Relations-panel filter in enrichRelations skips them. Other callers
      // (e.g. graph visualization tools) may still ask for tag labels.
      const note = await manager.createNote({ title: 'X', content: '', tags: ['gamma'] });
      // Find the tag id from the auto-created edge.
      const tagEdge = manager.findIncomingEdges('knowledge', note.id)
        .find(e => e.kind === 'tagged' && e.fromGraph === 'tags');
      expect(tagEdge).toBeDefined();
      const titles = manager.resolveTitles('tags', [tagEdge!.fromId]);
      expect(titles.get(tagEdge!.fromId)).toBe('gamma');
    });

    it('populates targetProjectSlug from edge fromProjectId/toProjectId', async () => {
      // The current test setup has a single project, so we synthesize the
      // cross-project case by injecting raw Edge objects with explicit
      // fromProjectId/toProjectId. This mirrors how the workspace scenario
      // works in real life: shared knowledge → project-scoped code/docs/files.
      const note = await manager.createNote({ title: 'Cross-project source', content: '' });
      const fakeOutgoing = {
        fromGraph: 'knowledge' as const, fromId: note.id, fromProjectId: 1,
        toGraph: 'code' as const, toId: 999, toProjectId: 1,
        kind: 'implemented_in',
      };
      const fakeIncoming = {
        fromGraph: 'tasks' as const, fromId: 888, fromProjectId: 1,
        toGraph: 'knowledge' as const, toId: note.id, toProjectId: 1,
        kind: 'documents',
      };
      const enriched = manager.enrichRelations('knowledge', note.id, [fakeOutgoing, fakeIncoming]);
      expect(enriched).toHaveLength(2);
      // Project id 1 was created in beforeEach with slug 'test'.
      expect(enriched[0].targetProjectSlug).toBe('test');
      expect(enriched[1].targetProjectSlug).toBe('test');
    });

    it('createEdge stores correct to_project_id for cross-project targets', async () => {
      // Workspace scenario: shared knowledge in project A points to a code
      // symbol that lives in project B. The edge must record to_project_id=B
      // so the UI can navigate to the right project page.
      const projectB = store.projects.create({ slug: 'other', name: 'Other', directory: '/tmp/other' });

      // Create a knowledge note in project A (the manager's project).
      const note = await manager.createNote({ title: 'A-side note', content: '' });

      // Inject a code "file" node directly into project B by writing to the
      // code table. We do this with raw SQL because there's no createCode in
      // StoreManager (code is indexer-managed). This mirrors what the indexer
      // does for project B.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = (store as any).db as import('better-sqlite3').Database;
      const insert = db.prepare(`INSERT INTO code (project_id, kind, file_id, name) VALUES (?, 'file', ?, ?)`);
      const codeId = Number(insert.run(projectB.id, 'src/foo.ts', 'src/foo.ts').lastInsertRowid);

      // Create the cross-project edge through StoreManager (the public API
      // path that REST/MCP also use).
      manager.createEdge({
        fromGraph: 'knowledge', fromId: note.id,
        toGraph: 'code', toId: codeId,
        kind: 'implemented_in',
      });

      // Inspect the raw row.
      const row = db.prepare(`SELECT from_project_id, to_project_id FROM edges WHERE from_graph='knowledge' AND from_id=? AND to_id=?`)
        .get(note.id, codeId) as { from_project_id: bigint; to_project_id: bigint };
      expect(Number(row.from_project_id)).toBe(manager.projectId);
      expect(Number(row.to_project_id)).toBe(projectB.id);

      // enrichRelations should surface the right project slug.
      const enriched = manager.enrichRelations('knowledge', note.id, manager.findOutgoingEdges('knowledge', note.id));
      const codeRel = enriched.find(e => e.targetGraph === 'code');
      expect(codeRel?.targetProjectSlug).toBe('other');
    });

    it('falls back to String(targetId) when target node was deleted (orphan edge)', async () => {
      const a = await manager.createNote({ title: 'A', content: '' });
      const b = await manager.createNote({ title: 'B', content: '' });
      manager.createEdge({
        fromGraph: 'knowledge', fromId: a.id,
        toGraph: 'knowledge', toId: b.id,
        kind: 'related_to',
      });
      // Delete the target — the edge is cascade-removed by the trigger, so
      // build a synthetic orphan edge to drive enrichRelations directly.
      manager.deleteNote(b.id);
      const orphanEdge = {
        fromGraph: 'knowledge' as const, fromId: a.id,
        toGraph: 'knowledge' as const, toId: 99999,
        kind: 'related_to',
      };
      const enriched = manager.enrichRelations('knowledge', a.id, [orphanEdge]);
      expect(enriched[0].title).toBe('99999');
    });
  });

  // =========================================================================
  // Attachments
  // =========================================================================

  describe('attachments', () => {
    it('adds and removes an attachment', async () => {
      const note = await manager.createNote({ title: 'Note', content: '' });
      const data = Buffer.from('hello');

      const meta = manager.addAttachment('knowledge', note.id, note.slug, 'test.txt', data);
      expect(meta.filename).toBe('test.txt');
      expect(meta.size).toBe(5);

      const list = manager.listAttachments('knowledge', note.id);
      expect(list.length).toBe(1);

      manager.removeAttachment('knowledge', note.id, note.slug, 'test.txt');
      expect(manager.listAttachments('knowledge', note.id).length).toBe(0);
    });
  });
});
