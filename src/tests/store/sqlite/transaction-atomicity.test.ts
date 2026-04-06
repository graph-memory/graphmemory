import { createSqliteStoreFactory, seedEmbedding, TEST_DIM } from '../helpers';
import type { SqliteStore } from '@/store';

describe('transaction atomicity', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'txn-test', name: 'Txn Test', directory: '/tmp/txn' });
    projectId = project.id;
  });

  afterEach(() => cleanup());

  describe('knowledge store', () => {
    it('create is atomic — note + embedding + tags in one transaction', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const note = scoped.knowledge.create({
        title: 'Atomic note',
        content: 'Test content',
        tags: ['tag1', 'tag2'],
      }, emb);

      expect(note.id).toBeGreaterThan(0);
      expect(note.tags).toEqual(['tag1', 'tag2']);

      // Verify vector was inserted (search should find it)
      const results = scoped.knowledge.search({
        embedding: emb,
        searchMode: 'vector',
        maxResults: 1,
      });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(note.id);
    });

    it('update is atomic — fields + embedding + tags', () => {
      const scoped = store.project(projectId);
      const emb1 = seedEmbedding(1, TEST_DIM);
      const emb2 = seedEmbedding(2, TEST_DIM);

      const note = scoped.knowledge.create({ title: 'Original', content: 'Original content' }, emb1);

      const updated = scoped.knowledge.update(
        note.id,
        { title: 'Updated', tags: ['new-tag'] },
        emb2,
      );

      expect(updated.title).toBe('Updated');
      expect(updated.tags).toEqual(['new-tag']);
      expect(updated.version).toBe(note.version + 1);

      // Verify new embedding is searchable
      const results = scoped.knowledge.search({
        embedding: emb2,
        searchMode: 'vector',
        maxResults: 1,
      });
      expect(results[0].id).toBe(note.id);
    });

    it('create upsert is atomic on slug conflict', () => {
      const scoped = store.project(projectId);
      const emb1 = seedEmbedding(1, TEST_DIM);
      const emb2 = seedEmbedding(2, TEST_DIM);

      const note1 = scoped.knowledge.create({
        slug: 'same-slug',
        title: 'First',
        content: 'First content',
        tags: ['old'],
      }, emb1);

      const note2 = scoped.knowledge.create({
        slug: 'same-slug',
        title: 'Second',
        content: 'Second content',
        tags: ['new'],
      }, emb2);

      // Should be same ID (upsert)
      expect(note2.id).toBe(note1.id);
      expect(note2.title).toBe('Second');
      expect(note2.tags).toEqual(['new']);
    });
  });

  describe('tasks store', () => {
    it('create is atomic — task + embedding + tags', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const task = scoped.tasks.create({
        title: 'Atomic task',
        description: 'Test desc',
        tags: ['urgent', 'bug'],
      }, emb);

      expect(task.id).toBeGreaterThan(0);
      expect(task.tags).toEqual(['bug', 'urgent']);
      expect(task.status).toBe('backlog');
    });

    it('update is atomic — fields + embedding + tags', () => {
      const scoped = store.project(projectId);
      const emb1 = seedEmbedding(1, TEST_DIM);
      const emb2 = seedEmbedding(2, TEST_DIM);

      const task = scoped.tasks.create({ title: 'Original task', description: 'desc' }, emb1);
      const updated = scoped.tasks.update(
        task.id,
        { title: 'Updated task', tags: ['done'] },
        emb2,
      );

      expect(updated.title).toBe('Updated task');
      expect(updated.tags).toEqual(['done']);
      expect(updated.version).toBe(task.version + 1);
    });

    it('bulkDelete is atomic — all or nothing', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const ids: number[] = [];
      for (let i = 0; i < 5; i++) {
        const t = scoped.tasks.create({ title: `Task ${i}`, description: '' }, emb);
        ids.push(t.id);
      }

      const deleted = scoped.tasks.bulkDelete(ids);
      expect(deleted).toBe(5);

      // All should be gone
      for (const id of ids) {
        expect(scoped.tasks.get(id)).toBeNull();
      }
    });

    it('bulkMove is atomic', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t = scoped.tasks.create({ title: `Task ${i}`, description: '' }, emb);
        ids.push(t.id);
      }

      const moved = scoped.tasks.bulkMove(ids, 'done');
      expect(moved).toBe(3);

      for (const id of ids) {
        const t = scoped.tasks.get(id)!;
        expect(t.status).toBe('done');
        expect(t.completedAt).not.toBeNull();
      }
    });

    it('bulkPriority is atomic', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const ids: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t = scoped.tasks.create({ title: `Task ${i}`, description: '' }, emb);
        ids.push(t.id);
      }

      const updated = scoped.tasks.bulkPriority(ids, 'critical');
      expect(updated).toBe(3);

      for (const id of ids) {
        expect(scoped.tasks.get(id)!.priority).toBe('critical');
      }
    });
  });

  describe('skills store', () => {
    it('create is atomic — skill + embedding + tags', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const skill = scoped.skills.create({
        title: 'Atomic skill',
        description: 'Test desc',
        tags: ['typescript', 'testing'],
      }, emb);

      expect(skill.id).toBeGreaterThan(0);
      expect(skill.tags).toEqual(['testing', 'typescript']);
    });
  });

  describe('epics store', () => {
    it('create is atomic — epic + embedding + tags', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const epic = scoped.epics.create({
        title: 'Atomic epic',
        description: 'Test desc',
        tags: ['milestone'],
      }, emb);

      expect(epic.id).toBeGreaterThan(0);
      expect(epic.tags).toEqual(['milestone']);
    });
  });

  describe('version conflict', () => {
    it('knowledge update throws on version mismatch', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);
      const note = scoped.knowledge.create({ title: 'Versioned', content: 'v1' }, emb);

      expect(() => {
        scoped.knowledge.update(note.id, { title: 'v2' }, null, undefined, 999);
      }).toThrow(/conflict/i);
    });

    it('tasks update throws on version mismatch', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);
      const task = scoped.tasks.create({ title: 'Versioned', description: '' }, emb);

      expect(() => {
        scoped.tasks.update(task.id, { title: 'v2' }, null, undefined, 999);
      }).toThrow(/conflict/i);
    });

    it('skills update throws on version mismatch', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);
      const skill = scoped.skills.create({ title: 'Versioned', description: '' }, emb);

      expect(() => {
        scoped.skills.update(skill.id, { title: 'v2' }, null, undefined, 999);
      }).toThrow(/conflict/i);
    });

    it('epics update throws on version mismatch', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);
      const epic = scoped.epics.create({ title: 'Versioned', description: '' }, emb);

      expect(() => {
        scoped.epics.update(epic.id, { title: 'v2' }, null, undefined, 999);
      }).toThrow(/conflict/i);
    });
  });

  describe('not-found errors', () => {
    it('knowledge update throws for non-existent note', () => {
      const scoped = store.project(projectId);
      expect(() => scoped.knowledge.update(99999, { title: 'x' }, null)).toThrow(/not found/i);
    });

    it('tasks update throws for non-existent task', () => {
      const scoped = store.project(projectId);
      expect(() => scoped.tasks.update(99999, { title: 'x' }, null)).toThrow(/not found/i);
    });

    it('skills update throws for non-existent skill', () => {
      const scoped = store.project(projectId);
      expect(() => scoped.skills.update(99999, { title: 'x' }, null)).toThrow(/not found/i);
    });

    it('epics update throws for non-existent epic', () => {
      const scoped = store.project(projectId);
      expect(() => scoped.epics.update(99999, { title: 'x' }, null)).toThrow(/not found/i);
    });
  });

  describe('store.transaction() wrapper', () => {
    it('commits on success', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const noteId = store.transaction(() => {
        const note = scoped.knowledge.create({ title: 'In txn', content: 'content' }, emb);
        return note.id;
      });

      expect(scoped.knowledge.get(noteId)).not.toBeNull();
    });

    it('rolls back on error', () => {
      const scoped = store.project(projectId);
      const emb = seedEmbedding(1, TEST_DIM);

      const countBefore = scoped.knowledge.list().total;

      try {
        store.transaction(() => {
          scoped.knowledge.create({ title: 'Will rollback', content: 'content' }, emb);
          throw new Error('Intentional rollback');
        });
      } catch {
        // Expected
      }

      const countAfter = scoped.knowledge.list().total;
      expect(countAfter).toBe(countBefore);
    });
  });

  describe('bulk operations on empty arrays', () => {
    it('bulkDelete with empty array returns 0', () => {
      const scoped = store.project(projectId);
      expect(scoped.tasks.bulkDelete([])).toBe(0);
    });

    it('bulkMove with empty array returns 0', () => {
      const scoped = store.project(projectId);
      expect(scoped.tasks.bulkMove([], 'done')).toBe(0);
    });

    it('bulkPriority with empty array returns 0', () => {
      const scoped = store.project(projectId);
      expect(scoped.tasks.bulkPriority([], 'critical')).toBe(0);
    });
  });

  describe('bulk operations on non-existent IDs', () => {
    it('bulkDelete with non-existent IDs returns 0', () => {
      const scoped = store.project(projectId);
      expect(scoped.tasks.bulkDelete([99999, 99998])).toBe(0);
    });

    it('bulkMove with non-existent IDs returns 0', () => {
      const scoped = store.project(projectId);
      expect(scoped.tasks.bulkMove([99999, 99998], 'done')).toBe(0);
    });

    it('bulkPriority with non-existent IDs returns 0', () => {
      const scoped = store.project(projectId);
      expect(scoped.tasks.bulkPriority([99999, 99998], 'critical')).toBe(0);
    });
  });
});
