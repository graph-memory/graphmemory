// Jest integration test for MCP knowledge tools.
// Split from mcp.test.ts — exercises create/get/update/list/search/delete notes + relations.
// Migrated to SQLite StoreManager (no Graphology KnowledgeGraph).

import {
  createFakeEmbed, createTestStoreManager, setupMcpClient, json, jsonList,
  type McpTestContext, type TestStoreContext,
} from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CreateNoteResult = { noteId: number };
type NoteResult = { id: number; title: string; content: string; tags: string[]; createdAt: number; updatedAt: number };
type NoteListEntry = { id: number; title: string; tags: string[]; updatedAt: number };
type UpdateResult = { noteId: number; updated: boolean };
type DelResult = { noteId: number; deleted: boolean };
type KnowledgeHit = { id: number; score: number };
type RelCreateResult = { fromId: number; toId: number; kind: string; targetGraph: string; created: boolean };
type RelDelResult = { fromId: number; toId: number; deleted: boolean };
type RelEntry = { fromGraph: string; fromId: number; toGraph: string; toId: number; kind: string };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const QUERY_AXES: Array<[string, number]> = [
  ['auth jwt knowledge', 26],
  ['database postgres', 27],
  ['rate limit api', 28],
];

const fakeEmbed = createFakeEmbed(QUERY_AXES);

let storeCtx: TestStoreContext;
let ctx: McpTestContext;
let call: McpTestContext['call'];

beforeAll(async () => {
  storeCtx = createTestStoreManager(fakeEmbed);
  ctx = await setupMcpClient({ storeManager: storeCtx.storeManager, embedFn: fakeEmbed });
  call = ctx.call;
});

afterAll(async () => {
  await ctx.close();
  storeCtx.cleanup();
});

// ---------------------------------------------------------------------------
// Tests — sequential within a single describe (Jest runs tests in order)
// ---------------------------------------------------------------------------

describe('knowledge tools', () => {
  let note1: CreateNoteResult;
  let note2: CreateNoteResult;
  let note3: CreateNoteResult;

  // ── notes_create ──

  it('notes_create: first note returns numeric noteId', async () => {
    note1 = json<CreateNoteResult>(await call('notes_create', {
      title: 'Auth JWT Knowledge',
      content: 'The system uses JWT for authentication.',
      tags: ['auth', 'security'],
    }));
    expect(typeof note1.noteId).toBe('number');
  });

  it('notes_create: second note returns numeric noteId', async () => {
    note2 = json<CreateNoteResult>(await call('notes_create', {
      title: 'Database Postgres',
      content: 'We use PostgreSQL 15 for persistence.',
      tags: ['infra'],
    }));
    expect(typeof note2.noteId).toBe('number');
  });

  it('notes_create: third note returns numeric noteId', async () => {
    note3 = json<CreateNoteResult>(await call('notes_create', {
      title: 'Rate Limit API',
      content: 'API rate limited to 100 req/min.',
      tags: ['api'],
    }));
    expect(typeof note3.noteId).toBe('number');
  });

  // ── notes_get ──

  it('notes_get: returns correct fields', async () => {
    const gotNote = json<NoteResult>(await call('notes_get', { noteId: note1.noteId }));
    expect(gotNote.id).toBe(note1.noteId);
    expect(gotNote.title).toBe('Auth JWT Knowledge');
    expect(gotNote.content).toContain('JWT');
    expect(gotNote.tags).toHaveLength(2);
    expect(gotNote.createdAt).toBeGreaterThan(0);
    expect(gotNote).not.toHaveProperty('embedding');
  });

  it('notes_get: missing note returns isError', async () => {
    const gotMissing = await call('notes_get', { noteId: 999999 });
    expect(gotMissing.isError).toBe(true);
  });

  // ── notes_list (before update) ──

  it('notes_list: returns all 3 notes', async () => {
    const allNotes = jsonList<NoteListEntry>(await call('notes_list'));
    expect(allNotes).toHaveLength(3);
    expect(allNotes.every(n => n.id && n.title)).toBe(true);
  });

  it('notes_list: filter "auth" matches 1 note', async () => {
    const filteredNotes = jsonList<NoteListEntry>(await call('notes_list', { filter: 'auth' }));
    expect(filteredNotes).toHaveLength(1);
    expect(filteredNotes[0].id).toBe(note1.noteId);
  });

  it('notes_list: tag "infra" matches 1 note', async () => {
    const taggedNotes = jsonList<NoteListEntry>(await call('notes_list', { tag: 'infra' }));
    expect(taggedNotes).toHaveLength(1);
    expect(taggedNotes[0].id).toBe(note2.noteId);
  });

  it('notes_list: limit=1 returns 1 note', async () => {
    const limitedNotes = jsonList<NoteListEntry>(await call('notes_list', { limit: 1 }));
    expect(limitedNotes).toHaveLength(1);
  });

  it('notes_list: filter no match returns empty', async () => {
    const noNotes = jsonList<NoteListEntry>(await call('notes_list', { filter: 'nonexistent' }));
    expect(noNotes).toHaveLength(0);
  });

  // ── notes_update ──

  it('notes_update: updates content and tags, title unchanged', async () => {
    const upd = json<UpdateResult>(await call('notes_update', {
      noteId: note1.noteId,
      content: 'Updated: JWT with refresh token support.',
      tags: ['auth', 'security', 'jwt'],
    }));
    expect(upd.updated).toBe(true);

    const updatedNote = json<NoteResult>(await call('notes_get', { noteId: note1.noteId }));
    expect(updatedNote.content).toContain('refresh token');
    expect(updatedNote.tags).toHaveLength(3);
    expect(updatedNote.title).toBe('Auth JWT Knowledge');
  });

  it('notes_update: missing note returns isError', async () => {
    const updMissing = await call('notes_update', { noteId: 999999, content: 'x' });
    expect(updMissing.isError).toBe(true);
  });

  // ── notes_create_link ──

  it('notes_create_link: creates depends_on relation between notes', async () => {
    const rel1 = json<RelCreateResult>(await call('notes_create_link', {
      fromId: note1.noteId, toId: note2.noteId, kind: 'depends_on',
    }));
    expect(rel1.created).toBe(true);
    expect(rel1.fromId).toBe(note1.noteId);
    expect(rel1.kind).toBe('depends_on');
  });

  it('notes_create_link: creates relates_to relation between notes', async () => {
    const rel2 = json<RelCreateResult>(await call('notes_create_link', {
      fromId: note2.noteId, toId: note3.noteId, kind: 'relates_to',
    }));
    expect(rel2.created).toBe(true);
    expect(rel2.fromId).toBe(note2.noteId);
    expect(rel2.toId).toBe(note3.noteId);
  });

  it('notes_create_link: explicit targetGraph=knowledge works', async () => {
    // note1→note3 with explicit targetGraph
    const rel3 = json<RelCreateResult>(await call('notes_create_link', {
      fromId: note1.noteId, toId: note3.noteId, kind: 'relates_to', targetGraph: 'knowledge',
    }));
    expect(rel3.created).toBe(true);
    expect(rel3.targetGraph).toBe('knowledge');
  });

  it('notes_create_link: invalid toId type returns isError', async () => {
    // Schema expects number; passing a non-numeric string triggers Zod validation error
    const relGhost = await call('notes_create_link', {
      fromId: note1.noteId, toId: 'ghost', kind: 'x',
    });
    expect(relGhost.isError).toBe(true);
  });

  // ── notes_list_links ──

  it('notes_list_links: note1 has 2 outgoing knowledge-graph edges', async () => {
    const allRels = json<RelEntry[]>(await call('notes_list_links', { noteId: note1.noteId }));
    // Filter to only knowledge→knowledge edges (list also includes tag edges)
    const rels1 = allRels.filter(r => r.fromGraph === 'knowledge' && r.toGraph === 'knowledge');
    // note1→note2 (depends_on) and note1→note3 (relates_to)
    expect(rels1).toHaveLength(2);
    const kinds = rels1.map(r => r.kind);
    expect(kinds).toContain('depends_on');
    expect(kinds).toContain('relates_to');
  });

  it('notes_list_links: note2 has 2 knowledge-graph edges (1 incoming + 1 outgoing)', async () => {
    const allRels = json<RelEntry[]>(await call('notes_list_links', { noteId: note2.noteId }));
    const rels2 = allRels.filter(r => r.fromGraph === 'knowledge' && r.toGraph === 'knowledge');
    expect(rels2).toHaveLength(2);
  });

  // ── notes_search ──

  it('notes_search: vector mode — exact match returns top-ranked result with positive score', async () => {
    const kHits1 = json<KnowledgeHit[]>(await call('notes_search', {
      query: 'auth jwt knowledge',
      maxResults: 1,
      searchMode: 'vector',
    }));
    expect(kHits1).toHaveLength(1);
    expect(kHits1[0].id).toBe(note1.noteId);
    // Scores are RRF-based (1/(60+rn)); rank 1 = ~0.01639
    expect(kHits1[0].score).toBeGreaterThan(0);
    expect(typeof kHits1[0].id).toBe('number');
    expect(typeof kHits1[0].score).toBe('number');
  });

  it('notes_search: vector mode — postgres query returns note2 first', async () => {
    const hits = json<KnowledgeHit[]>(await call('notes_search', {
      query: 'database postgres',
      maxResults: 3,
      searchMode: 'vector',
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(note2.noteId);
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('notes_search: keyword mode — returns results for PostgreSQL content', async () => {
    const hits = json<KnowledgeHit[]>(await call('notes_search', {
      query: 'PostgreSQL persistence',
      maxResults: 3,
      searchMode: 'keyword',
      minScore: 0,
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(note2.noteId);
  });

  it('notes_search: unknown query returns empty with minScore filter', async () => {
    const kHitsNone = json<KnowledgeHit[]>(await call('notes_search', {
      query: 'xyzzy completely unknown xyz',
      minScore: 0.1,
      searchMode: 'keyword',
    }));
    expect(kHitsNone).toHaveLength(0);
  });

  // ── notes_delete_link ──

  it('notes_delete_link: deletes existing depends_on relation', async () => {
    const relDel = json<RelDelResult>(await call('notes_delete_link', {
      fromId: note1.noteId, toId: note2.noteId, kind: 'depends_on',
    }));
    expect(relDel.deleted).toBe(true);
  });

  it('notes_delete_link: note1 has 1 knowledge edge remaining after delete', async () => {
    const allRels = json<RelEntry[]>(await call('notes_list_links', { noteId: note1.noteId }));
    const relsAfterDel = allRels.filter(r => r.fromGraph === 'knowledge' && r.toGraph === 'knowledge');
    // note1→note3 (relates_to) remains
    expect(relsAfterDel).toHaveLength(1);
    expect(relsAfterDel[0].kind).toBe('relates_to');
  });

  it('notes_delete_link: deletes remaining note1→note3 relation', async () => {
    const relDel2 = json<RelDelResult>(await call('notes_delete_link', {
      fromId: note1.noteId, toId: note3.noteId, kind: 'relates_to',
    }));
    expect(relDel2.deleted).toBe(true);
  });

  // ── notes_delete ──

  it('notes_delete: deletes note and reports deleted=true', async () => {
    const del = json<DelResult>(await call('notes_delete', { noteId: note3.noteId }));
    expect(del.deleted).toBe(true);
  });

  it('notes_delete: missing note returns isError', async () => {
    const delMissing = await call('notes_delete', { noteId: 999999 });
    expect(delMissing.isError).toBe(true);
  });

  it('notes_delete: 2 notes remain after delete', async () => {
    const remainingNotes = jsonList<NoteListEntry>(await call('notes_list'));
    expect(remainingNotes).toHaveLength(2);
  });

  it('notes_delete: note2 has 0 knowledge edges after note3 deletion', async () => {
    const allRels = json<RelEntry[]>(await call('notes_list_links', { noteId: note2.noteId }));
    const relsNote2 = allRels.filter(r => r.fromGraph === 'knowledge' && r.toGraph === 'knowledge');
    expect(relsNote2).toHaveLength(0);
  });
});
