import { createSqliteStoreFactory, seedEmbedding } from '../helpers';
import { SqliteStore, VersionConflictError } from '@/store';
import { SqliteSkillsStore } from '@/store/sqlite/stores/skills';

describe('SkillsStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;
  let skills: SqliteSkillsStore;
  let projectId: number;

  beforeEach(() => {
    ({ store, cleanup } = factory());
    const project = store.projects.create({ slug: 'test', name: 'Test', directory: '/test' });
    projectId = project.id;
    skills = new SqliteSkillsStore(store.getDb(), projectId);
  });

  afterEach(() => { cleanup(); });

  // --- Create ---

  it('creates a skill with defaults', () => {
    const skill = skills.create({ title: 'Deploy', description: 'How to deploy' }, seedEmbedding(1));
    expect(skill.id).toBeGreaterThan(0);
    expect(skill.slug).toMatch(/^[0-9a-f-]{36}$/);
    expect(skill.source).toBe('user');
    expect(skill.confidence).toBe(1.0);
    expect(skill.usageCount).toBe(0);
    expect(skill.lastUsedAt).toBeNull();
    expect(skill.steps).toEqual([]);
    expect(skill.triggers).toEqual([]);
    expect(skill.inputHints).toEqual([]);
    expect(skill.filePatterns).toEqual([]);
    expect(skill.tags).toEqual([]);
  });

  it('creates with all fields', () => {
    const skill = skills.create({
      title: 'Full', description: 'All fields',
      steps: ['step 1', 'step 2'],
      triggers: ['when deploying'],
      inputHints: ['project name'],
      filePatterns: ['*.yml'],
      tags: ['devops', 'ci'],
      source: 'learned',
      confidence: 0.8,
    }, seedEmbedding(1));
    expect(skill.steps).toEqual(['step 1', 'step 2']);
    expect(skill.triggers).toEqual(['when deploying']);
    expect(skill.inputHints).toEqual(['project name']);
    expect(skill.filePatterns).toEqual(['*.yml']);
    expect(skill.tags).toEqual(['ci', 'devops']); // sorted
    expect(skill.source).toBe('learned');
    expect(skill.confidence).toBe(0.8);
  });

  // --- Get ---

  it('gets by id with edges', () => {
    const skill = skills.create({ title: 'S', description: '' }, seedEmbedding(1));
    const detail = skills.get(skill.id);
    expect(detail).not.toBeNull();
    expect(detail!.edges).toEqual([]);
  });

  it('gets by slug', () => {
    const skill = skills.create({ title: 'Slug', description: '' }, seedEmbedding(1));
    expect(skills.getBySlug(skill.slug)).not.toBeNull();
  });

  it('returns null for missing', () => {
    expect(skills.get(999)).toBeNull();
    expect(skills.getBySlug('nope')).toBeNull();
  });

  // --- Update ---

  it('updates fields', () => {
    const skill = skills.create({ title: 'Old', description: '' }, seedEmbedding(1));
    const updated = skills.update(skill.id, {
      title: 'New', steps: ['a', 'b'], confidence: 0.5,
    }, seedEmbedding(2));
    expect(updated.title).toBe('New');
    expect(updated.steps).toEqual(['a', 'b']);
    expect(updated.confidence).toBe(0.5);
    expect(updated.version).toBe(2);
  });

  it('updates tags', () => {
    const skill = skills.create({ title: 'T', description: '', tags: ['old'] }, seedEmbedding(1));
    const updated = skills.update(skill.id, { tags: ['new'] }, null);
    expect(updated.tags).toEqual(['new']);
  });

  it('throws VersionConflictError', () => {
    const skill = skills.create({ title: 'V', description: '' }, seedEmbedding(1));
    expect(() => skills.update(skill.id, { title: 'X' }, null, undefined, 99)).toThrow(VersionConflictError);
  });

  // --- Delete ---

  it('deletes a skill', () => {
    const skill = skills.create({ title: 'Del', description: '' }, seedEmbedding(1));
    skills.delete(skill.id);
    expect(skills.get(skill.id)).toBeNull();
  });

  // --- bumpUsage ---

  it('increments usageCount and sets lastUsedAt', () => {
    const skill = skills.create({ title: 'Bump', description: '' }, seedEmbedding(1));
    expect(skill.usageCount).toBe(0);
    expect(skill.lastUsedAt).toBeNull();

    skills.bumpUsage(skill.id);
    const bumped = skills.get(skill.id)!;
    expect(bumped.usageCount).toBe(1);
    expect(bumped.lastUsedAt).toBeGreaterThan(0);

    skills.bumpUsage(skill.id);
    expect(skills.get(skill.id)!.usageCount).toBe(2);
  });

  // --- List ---

  it('lists with pagination', () => {
    skills.create({ title: 'A', description: '' }, seedEmbedding(1));
    skills.create({ title: 'B', description: '' }, seedEmbedding(2));
    skills.create({ title: 'C', description: '' }, seedEmbedding(3));

    const page = skills.list({ limit: 2 });
    expect(page.results.length).toBe(2);
    expect(page.total).toBe(3);
  });

  it('lists with source filter', () => {
    skills.create({ title: 'User', description: '', source: 'user' }, seedEmbedding(1));
    skills.create({ title: 'Learned', description: '', source: 'learned' }, seedEmbedding(2));

    const result = skills.list({ source: 'learned' });
    expect(result.results.length).toBe(1);
    expect(result.results[0].title).toBe('Learned');
  });

  it('lists with tag filter', () => {
    skills.create({ title: 'Tagged', description: '', tags: ['devops'] }, seedEmbedding(1));
    skills.create({ title: 'No tag', description: '' }, seedEmbedding(2));

    const result = skills.list({ tag: 'devops' });
    expect(result.results.length).toBe(1);
  });

  it('lists with text filter', () => {
    skills.create({ title: 'Deploy to AWS', description: '' }, seedEmbedding(1));
    skills.create({ title: 'Run tests', description: '' }, seedEmbedding(2));

    const result = skills.list({ filter: 'AWS' });
    expect(result.results.length).toBe(1);
  });

  // --- Search ---

  it('searches by keyword', () => {
    skills.create({ title: 'Deploy AWS', description: 'Cloud deployment' }, seedEmbedding(1));
    skills.create({ title: 'Run tests', description: 'Testing locally' }, seedEmbedding(2));

    const results = skills.search({ text: 'deploy', searchMode: 'keyword' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('searches by vector', () => {
    skills.create({ title: 'A', description: '' }, seedEmbedding(1));
    skills.create({ title: 'B', description: '' }, seedEmbedding(2));

    const results = skills.search({ embedding: seedEmbedding(1), searchMode: 'vector' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe(1);
  });

  // --- JSON arrays round-trip ---

  it('preserves JSON array fields through create/update/get', () => {
    const skill = skills.create({
      title: 'JSON', description: '',
      steps: ['first', 'second'],
      triggers: ['on push'],
      inputHints: ['branch name'],
      filePatterns: ['*.ts', '*.js'],
    }, seedEmbedding(1));

    const fetched = skills.get(skill.id)!;
    expect(fetched.steps).toEqual(['first', 'second']);
    expect(fetched.triggers).toEqual(['on push']);
    expect(fetched.inputHints).toEqual(['branch name']);
    expect(fetched.filePatterns).toEqual(['*.ts', '*.js']);

    // Update one field
    skills.update(skill.id, { steps: ['only one'] }, null);
    const updated = skills.get(skill.id)!;
    expect(updated.steps).toEqual(['only one']);
    expect(updated.triggers).toEqual(['on push']); // preserved
  });

  // --- Timestamps ---

  it('getUpdatedAt works', () => {
    const skill = skills.create({ title: 'T', description: '' }, seedEmbedding(1));
    expect(skills.getUpdatedAt(skill.id)).toBe(skill.updatedAt);
    expect(skills.getUpdatedAt(999)).toBeNull();
  });
});
