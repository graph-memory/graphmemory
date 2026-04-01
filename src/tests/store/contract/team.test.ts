import { createSqliteStoreFactory } from '../helpers';
import { SqliteStore } from '@/store';

describe('TeamStore contract', () => {
  const factory = createSqliteStoreFactory();
  let store: SqliteStore;
  let cleanup: () => void;

  beforeEach(() => {
    ({ store, cleanup } = factory());
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a team member', () => {
    const member = store.team.create({ slug: 'john', name: 'John Doe' });
    expect(member.id).toBeGreaterThan(0);
    expect(member.slug).toBe('john');
    expect(member.name).toBe('John Doe');
    expect(member.email).toBeNull();
    expect(member.role).toBeNull();
    expect(member.createdAt).toBeGreaterThan(0);
    expect(member.updatedAt).toBeGreaterThan(0);
  });

  it('creates with email and role', () => {
    const member = store.team.create({ slug: 'jane', name: 'Jane', email: 'jane@test.com', role: 'admin' });
    expect(member.email).toBe('jane@test.com');
    expect(member.role).toBe('admin');
  });

  it('enforces slug uniqueness', () => {
    store.team.create({ slug: 'unique', name: 'First' });
    expect(() => store.team.create({ slug: 'unique', name: 'Second' })).toThrow();
  });

  it('gets by id', () => {
    const created = store.team.create({ slug: 'bob', name: 'Bob' });
    const fetched = store.team.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.slug).toBe('bob');
  });

  it('returns null for missing id', () => {
    expect(store.team.get(999)).toBeNull();
  });

  it('gets by slug', () => {
    store.team.create({ slug: 'alice', name: 'Alice' });
    const fetched = store.team.getBySlug('alice');
    expect(fetched).not.toBeNull();
    expect(fetched!.name).toBe('Alice');
  });

  it('returns null for missing slug', () => {
    expect(store.team.getBySlug('nonexistent')).toBeNull();
  });

  it('updates a member', () => {
    const created = store.team.create({ slug: 'upd', name: 'Original' });
    const updated = store.team.update(created.id, { name: 'Updated', email: 'new@test.com' });
    expect(updated.name).toBe('Updated');
    expect(updated.email).toBe('new@test.com');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
  });

  it('partial update preserves other fields', () => {
    const created = store.team.create({ slug: 'partial', name: 'Name', email: 'keep@test.com', role: 'dev' });
    const updated = store.team.update(created.id, { role: 'lead' });
    expect(updated.name).toBe('Name');
    expect(updated.email).toBe('keep@test.com');
    expect(updated.role).toBe('lead');
  });

  it('throws on update of missing member', () => {
    expect(() => store.team.update(999, { name: 'X' })).toThrow('not found');
  });

  it('deletes a member', () => {
    const created = store.team.create({ slug: 'del', name: 'Delete Me' });
    store.team.delete(created.id);
    expect(store.team.get(created.id)).toBeNull();
  });

  it('lists members with pagination', () => {
    store.team.create({ slug: 'a', name: 'Alice' });
    store.team.create({ slug: 'b', name: 'Bob' });
    store.team.create({ slug: 'c', name: 'Charlie' });

    const page1 = store.team.list({ limit: 2, offset: 0 });
    expect(page1.results.length).toBe(2);
    expect(page1.total).toBe(3);

    const page2 = store.team.list({ limit: 2, offset: 2 });
    expect(page2.results.length).toBe(1);
    expect(page2.total).toBe(3);
  });

  it('meta is prefixed with team:', () => {
    store.team.setMeta('version', '1');
    expect(store.team.getMeta('version')).toBe('1');
    // Should not collide with store-level meta
    expect(store.getMeta('version')).toBeNull();
  });
});
