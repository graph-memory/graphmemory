import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import type { SqliteStore } from '@/store';
import type { ProjectScopedStore } from '@/store';

describe('importRecord', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let scoped: ProjectScopedStore;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/tmp/test' });
    scoped = store.project(project.id);
  });

  afterEach(() => cleanup());

  // =========================================================================
  // Knowledge importRecord
  // =========================================================================

  describe('knowledge', () => {
    it('inserts a new note by slug', () => {
      const record = scoped.knowledge.importRecord({
        slug: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        title: 'Imported Note',
        content: 'Content from mirror',
        tags: ['imported', 'test'],
        createdAt: 1000000,
        updatedAt: 2000000,
        version: 5,
      }, seedEmbedding(1));

      expect(record.slug).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
      expect(record.title).toBe('Imported Note');
      expect(record.content).toBe('Content from mirror');
      expect(record.tags).toEqual(['imported', 'test']);
      expect(record.createdAt).toBe(1000000);
      expect(record.updatedAt).toBe(2000000);
      expect(record.version).toBe(5);
    });

    it('updates existing note on duplicate slug', () => {
      const first = scoped.knowledge.importRecord({
        slug: 'same-slug',
        title: 'V1',
        content: 'First',
        createdAt: 1000000,
        updatedAt: 1000000,
        version: 1,
      }, seedEmbedding(1));

      const second = scoped.knowledge.importRecord({
        slug: 'same-slug',
        title: 'V2',
        content: 'Updated',
        tags: ['new-tag'],
        createdAt: 1000000,
        updatedAt: 3000000,
        version: 3,
      }, seedEmbedding(2));

      expect(second.id).toBe(first.id);
      expect(second.title).toBe('V2');
      expect(second.content).toBe('Updated');
      expect(second.version).toBe(3);
      expect(second.updatedAt).toBe(3000000);
      expect(second.tags).toEqual(['new-tag']);
    });

    it('is retrievable by slug after import', () => {
      scoped.knowledge.importRecord({
        slug: 'lookup-slug',
        title: 'Findable',
        content: '',
        createdAt: 1000000,
        updatedAt: 1000000,
        version: 1,
      }, seedEmbedding(1));

      const found = scoped.knowledge.getBySlug('lookup-slug');
      expect(found).not.toBeNull();
      expect(found!.title).toBe('Findable');
    });

    it('is searchable after import', () => {
      scoped.knowledge.importRecord({
        slug: 'search-slug',
        title: 'Searchable Note',
        content: 'This note should be found by FTS',
        createdAt: 1000000,
        updatedAt: 1000000,
        version: 1,
      }, seedEmbedding(1));

      const results = scoped.knowledge.search({ text: 'searchable', searchMode: 'keyword' });
      expect(results.length).toBe(1);
    });
  });

  // =========================================================================
  // Tasks importRecord
  // =========================================================================

  describe('tasks', () => {
    it('inserts a new task by slug', () => {
      const record = scoped.tasks.importRecord({
        slug: 'task-slug-1',
        title: 'Imported Task',
        description: 'From mirror',
        status: 'in_progress',
        priority: 'high',
        tags: ['urgent'],
        dueDate: 5000000,
        estimate: 8,
        completedAt: null,
        createdAt: 1000000,
        updatedAt: 2000000,
        version: 3,
      }, seedEmbedding(1));

      expect(record.slug).toBe('task-slug-1');
      expect(record.status).toBe('in_progress');
      expect(record.priority).toBe('high');
      expect(record.dueDate).toBe(5000000);
      expect(record.version).toBe(3);
    });

    it('updates existing task on duplicate slug', () => {
      const first = scoped.tasks.importRecord({
        slug: 'dup-task',
        title: 'V1',
        description: '',
        status: 'backlog',
        priority: 'low',
        createdAt: 1000000,
        updatedAt: 1000000,
        version: 1,
      }, seedEmbedding(1));

      const second = scoped.tasks.importRecord({
        slug: 'dup-task',
        title: 'V2',
        description: 'Updated',
        status: 'done',
        priority: 'high',
        completedAt: 4000000,
        createdAt: 1000000,
        updatedAt: 4000000,
        version: 4,
      }, seedEmbedding(2));

      expect(second.id).toBe(first.id);
      expect(second.title).toBe('V2');
      expect(second.status).toBe('done');
      expect(second.completedAt).toBe(4000000);
    });
  });

  // =========================================================================
  // Skills importRecord
  // =========================================================================

  describe('skills', () => {
    it('inserts a new skill by slug', () => {
      const record = scoped.skills.importRecord({
        slug: 'skill-slug-1',
        title: 'Imported Skill',
        description: 'From mirror',
        steps: ['step 1', 'step 2'],
        triggers: ['on deploy'],
        source: 'learned',
        confidence: 0.8,
        usageCount: 5,
        lastUsedAt: 3000000,
        createdAt: 1000000,
        updatedAt: 2000000,
        version: 2,
      }, seedEmbedding(1));

      expect(record.slug).toBe('skill-slug-1');
      expect(record.steps).toEqual(['step 1', 'step 2']);
      expect(record.source).toBe('learned');
      expect(record.confidence).toBe(0.8);
      expect(record.usageCount).toBe(5);
    });

    it('updates existing skill on duplicate slug', () => {
      const first = scoped.skills.importRecord({
        slug: 'dup-skill',
        title: 'V1',
        description: '',
        createdAt: 1000000,
        updatedAt: 1000000,
        version: 1,
      }, seedEmbedding(1));

      const second = scoped.skills.importRecord({
        slug: 'dup-skill',
        title: 'V2',
        description: 'Updated',
        steps: ['new step'],
        confidence: 0.5,
        createdAt: 1000000,
        updatedAt: 3000000,
        version: 3,
      }, seedEmbedding(2));

      expect(second.id).toBe(first.id);
      expect(second.title).toBe('V2');
      expect(second.steps).toEqual(['new step']);
      expect(second.confidence).toBe(0.5);
    });
  });

  // =========================================================================
  // Epics importRecord
  // =========================================================================

  describe('epics', () => {
    it('inserts a new epic by slug', () => {
      const record = scoped.epics.importRecord({
        slug: 'epic-slug-1',
        title: 'Imported Epic',
        description: 'From mirror',
        status: 'in_progress',
        priority: 'high',
        tags: ['release'],
        createdAt: 1000000,
        updatedAt: 2000000,
        version: 2,
      }, seedEmbedding(1));

      expect(record.slug).toBe('epic-slug-1');
      expect(record.status).toBe('in_progress');
      expect(record.priority).toBe('high');
      expect(record.tags).toEqual(['release']);
      expect(record.version).toBe(2);
    });

    it('updates existing epic on duplicate slug', () => {
      const first = scoped.epics.importRecord({
        slug: 'dup-epic',
        title: 'V1',
        description: '',
        status: 'open',
        priority: 'low',
        createdAt: 1000000,
        updatedAt: 1000000,
        version: 1,
      }, seedEmbedding(1));

      const second = scoped.epics.importRecord({
        slug: 'dup-epic',
        title: 'V2',
        description: 'Updated',
        status: 'done',
        priority: 'high',
        createdAt: 1000000,
        updatedAt: 3000000,
        version: 3,
      }, seedEmbedding(2));

      expect(second.id).toBe(first.id);
      expect(second.title).toBe('V2');
      expect(second.status).toBe('done');
    });
  });
});
