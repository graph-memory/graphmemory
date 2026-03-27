// Jest integration test for MCP knowledge tools.
// Split from mcp.test.ts — exercises create/get/update/list/search/delete notes + relations.

import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import { createGraph } from '@/graphs/docs';
import { createCodeGraph } from '@/graphs/code-types';
import { createFakeEmbed, setupMcpClient, json, unitVec, type McpTestContext } from '@/tests/helpers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CreateNoteResult = { noteId: string };
type NoteResult = { id: string; title: string; content: string; tags: string[]; createdAt: number; updatedAt: number };
type NoteListEntry = { id: string; title: string; tags: string[]; updatedAt: number };
type UpdateResult = { noteId: string; updated: boolean };
type DelResult = { noteId: string; deleted: boolean };
type KnowledgeHit = { id: string; title: string; content: string; tags: string[]; score: number };
type RelCreateResult = { fromId: string; toId: string; kind: string; created: boolean };
type RelDelResult = { fromId: string; toId: string; deleted: boolean };
type RelEntry = { fromId: string; toId: string; kind: string; targetGraph?: string };

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const knowledgeGraph = createKnowledgeGraph();

const QUERY_AXES: Array<[string, number]> = [
  ['auth jwt knowledge', 26],
  ['database postgres', 27],
  ['rate limit api', 28],
];

const fakeEmbed = createFakeEmbed(QUERY_AXES);

let ctx: McpTestContext;
let call: McpTestContext['call'];

beforeAll(async () => {
  ctx = await setupMcpClient({ knowledgeGraph, embedFn: fakeEmbed });
  call = ctx.call;
});

afterAll(async () => {
  await ctx.close();
});

// ---------------------------------------------------------------------------
// Tests — sequential within a single describe (Jest runs tests in order)
// ---------------------------------------------------------------------------

describe('knowledge tools', () => {
  let note1: CreateNoteResult;
  let note2: CreateNoteResult;
  let note3: CreateNoteResult;

  // ── notes_create ──

  it('notes_create: first note returns slug noteId', async () => {
    note1 = json<CreateNoteResult>(await call('notes_create', {
      title: 'Auth JWT Knowledge',
      content: 'The system uses JWT for authentication.',
      tags: ['auth', 'security'],
    }));
    expect(typeof note1.noteId).toBe('string');
    expect(note1.noteId).toMatch(/^[0-9a-f]{8}-/);
  });

  it('notes_create: second note', async () => {
    note2 = json<CreateNoteResult>(await call('notes_create', {
      title: 'Database Postgres',
      content: 'We use PostgreSQL 15 for persistence.',
      tags: ['infra'],
    }));
    expect(note2.noteId).toMatch(/^[0-9a-f]{8}-/);
  });

  it('notes_create: third note', async () => {
    note3 = json<CreateNoteResult>(await call('notes_create', {
      title: 'Rate Limit API',
      content: 'API rate limited to 100 req/min.',
      tags: ['api'],
    }));
    expect(note3.noteId).toMatch(/^[0-9a-f]{8}-/);
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
    const gotMissing = await call('notes_get', { noteId: 'ghost' });
    expect(gotMissing.isError).toBe(true);
  });

  // ── notes_list (before update) ──

  it('notes_list: returns all 3 notes', async () => {
    const allNotes = json<NoteListEntry[]>(await call('notes_list'));
    expect(allNotes).toHaveLength(3);
    expect(allNotes.every(n => n.id && n.title)).toBe(true);
  });

  it('notes_list: filter "auth" matches 1 note', async () => {
    const filteredNotes = json<NoteListEntry[]>(await call('notes_list', { filter: 'auth' }));
    expect(filteredNotes).toHaveLength(1);
    expect(filteredNotes[0].id).toBe(note1.noteId);
  });

  it('notes_list: tag "infra" matches 1 note', async () => {
    const taggedNotes = json<NoteListEntry[]>(await call('notes_list', { tag: 'infra' }));
    expect(taggedNotes).toHaveLength(1);
    expect(taggedNotes[0].id).toBe(note2.noteId);
  });

  it('notes_list: limit=1 returns 1 note', async () => {
    const limitedNotes = json<NoteListEntry[]>(await call('notes_list', { limit: 1 }));
    expect(limitedNotes).toHaveLength(1);
  });

  it('notes_list: filter no match returns empty', async () => {
    const noNotes = json<NoteListEntry[]>(await call('notes_list', { filter: 'nonexistent' }));
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
    const updMissing = await call('notes_update', { noteId: 'ghost', content: 'x' });
    expect(updMissing.isError).toBe(true);
  });

  // ── notes_create_link ──

  it('notes_create_link: creates depends_on relation', async () => {
    const rel1 = json<RelCreateResult>(await call('notes_create_link', {
      fromId: note1.noteId, toId: note2.noteId, kind: 'depends_on', projectId: 'test',
    }));
    expect(rel1.created).toBe(true);
    expect(rel1.fromId).toBe(note1.noteId);
    expect(rel1.kind).toBe('depends_on');
  });

  it('notes_create_link: creates relates_to relation', async () => {
    const rel2 = json<RelCreateResult>(await call('notes_create_link', {
      fromId: note2.noteId, toId: note3.noteId, kind: 'relates_to', projectId: 'test',
    }));
    expect(rel2.created).toBe(true);
  });

  it('notes_create_link: duplicate returns isError', async () => {
    const relDup = await call('notes_create_link', {
      fromId: note1.noteId, toId: note2.noteId, kind: 'depends_on', projectId: 'test',
    });
    expect(relDup.isError).toBe(true);
  });

  it('notes_create_link: missing node returns isError', async () => {
    const relGhost = await call('notes_create_link', {
      fromId: note1.noteId, toId: 'ghost', kind: 'x', projectId: 'test',
    });
    expect(relGhost.isError).toBe(true);
  });

  // ── notes_list_links ──

  it('notes_list_links: note1 has 1 relation', async () => {
    const rels1 = json<RelEntry[]>(await call('notes_list_links', { noteId: note1.noteId }));
    expect(rels1).toHaveLength(1);
    expect(rels1[0].kind).toBe('depends_on');
  });

  it('notes_list_links: note2 has 2 relations (in + out)', async () => {
    const rels2 = json<RelEntry[]>(await call('notes_list_links', { noteId: note2.noteId }));
    expect(rels2).toHaveLength(2);
  });

  // ── notes_search ──

  it('notes_search: exact match returns score 1.0', async () => {
    const kHits1 = json<KnowledgeHit[]>(await call('notes_search', { query: 'auth jwt knowledge', topK: 1, bfsDepth: 0, searchMode: 'vector' }));
    expect(kHits1).toHaveLength(1);
    expect(kHits1[0].id).toBe(note1.noteId);
    expect(kHits1[0].score).toBe(1.0);
    expect(typeof kHits1[0].title).toBe('string');
    expect(typeof kHits1[0].content).toBe('string');
    expect(Array.isArray(kHits1[0].tags)).toBe(true);
  });

  it('notes_search: BFS depth=1 includes seed and depends_on neighbor', async () => {
    const kHits2 = json<KnowledgeHit[]>(await call('notes_search', { query: 'auth jwt knowledge', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
    const kIds2 = kHits2.map(h => h.id);
    expect(kIds2).toContain(note1.noteId);
    expect(kIds2).toContain(note2.noteId);
    expect(kIds2).not.toContain(note3.noteId);

    // BFS score decay
    const kSeed = kHits2.find(h => h.id === note1.noteId)!.score;
    const kBfs = kHits2.find(h => h.id === note2.noteId)!.score;
    expect(kBfs).toBeLessThan(kSeed);
    expect(Math.abs(kBfs - kSeed * 0.8)).toBeLessThan(0.001);
  });

  it('notes_search: BFS depth=2 reaches rate-limit', async () => {
    const kHits3 = json<KnowledgeHit[]>(await call('notes_search', { query: 'auth jwt knowledge', topK: 1, bfsDepth: 2, minScore: 0 }));
    const kIds3 = kHits3.map(h => h.id);
    expect(kIds3).toContain(note3.noteId);
  });

  it('notes_search: minScore=0.9 returns only seed', async () => {
    const kHitsMin = json<KnowledgeHit[]>(await call('notes_search', { query: 'auth jwt knowledge', topK: 1, bfsDepth: 1, minScore: 0.9, searchMode: 'vector' }));
    expect(kHitsMin).toHaveLength(1);
    expect(kHitsMin[0].id).toBe(note1.noteId);
  });

  it('notes_search: vector-only mode returns results', async () => {
    const hits = json<KnowledgeHit[]>(await call('notes_search', {
      query: 'database postgres',
      topK: 3,
      bfsDepth: 0,
      searchMode: 'vector',
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(note2.noteId);
    expect(hits[0].score).toBeGreaterThan(0.5);
  });

  it('notes_search: keyword-only mode returns results', async () => {
    const hits = json<KnowledgeHit[]>(await call('notes_search', {
      query: 'PostgreSQL persistence',
      topK: 3,
      bfsDepth: 0,
      searchMode: 'keyword',
      minScore: 0,
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(note2.noteId);
  });

  it('notes_search: unknown query returns empty', async () => {
    const kHitsNone = json<KnowledgeHit[]>(await call('notes_search', { query: 'xyzzy completely unknown xyz', minScore: 0.1, searchMode: 'keyword' }));
    expect(kHitsNone).toHaveLength(0);
  });

  // ── notes_delete_link ──

  it('notes_delete_link: deletes existing relation', async () => {
    const relDel = json<RelDelResult>(await call('notes_delete_link', { fromId: note1.noteId, toId: note2.noteId, projectId: 'test' }));
    expect(relDel.deleted).toBe(true);
  });

  it('notes_delete_link: missing relation returns isError', async () => {
    const relDelMissing = await call('notes_delete_link', { fromId: note1.noteId, toId: note2.noteId, projectId: 'test' });
    expect(relDelMissing.isError).toBe(true);
  });

  it('notes_delete_link: note1 has 0 relations after delete', async () => {
    const relsAfterDel = json<RelEntry[]>(await call('notes_list_links', { noteId: note1.noteId }));
    expect(relsAfterDel).toHaveLength(0);
  });

  // ── notes_delete ──

  it('notes_delete: deletes note and cleans up relations', async () => {
    const del = json<DelResult>(await call('notes_delete', { noteId: note3.noteId }));
    expect(del.deleted).toBe(true);
  });

  it('notes_delete: missing note returns isError', async () => {
    const delMissing = await call('notes_delete', { noteId: 'ghost' });
    expect(delMissing.isError).toBe(true);
  });

  it('notes_delete: 2 notes remain after delete', async () => {
    const remainingNotes = json<NoteListEntry[]>(await call('notes_list'));
    expect(remainingNotes).toHaveLength(2);
  });

  it('notes_delete: note2 relations cleaned up after note3 delete', async () => {
    const relsNote2 = json<RelEntry[]>(await call('notes_list_links', { noteId: note2.noteId }));
    expect(relsNote2).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cross-graph relations via MCP
// ---------------------------------------------------------------------------

describe('cross-graph relation tools', () => {
  // Separate graphs with nodes for cross-graph linking
  const xDocGraph = createGraph();
  const xCodeGraph = createCodeGraph();
  const xKnowledgeGraph = createKnowledgeGraph();

  const xFakeEmbed = createFakeEmbed([['note', 10]]);
  let xCtx: McpTestContext;
  let xCall: McpTestContext['call'];

  type XRelCreateResult = { fromId: string; toId: string; kind: string; targetGraph: string; created: boolean };

  beforeAll(async () => {
    // Add doc node
    xDocGraph.addNode('guide.md::Setup', {
      title: 'Setup',
      content: 'How to set up',
      fileId: 'guide.md',
      level: 2,
      embedding: unitVec(0),
      fileEmbedding: [],
      mtime: 1000,
      symbols: [],
    });

    // Add code node
    xCodeGraph.addNode('auth.ts::AuthService', {
      kind: 'class' as const,
      name: 'AuthService',
      fileId: 'auth.ts',
      signature: 'class AuthService',
      docComment: '',
      body: 'class AuthService {}',
      startLine: 1,
      endLine: 50,
      isExported: true,
      embedding: unitVec(1),
      fileEmbedding: [],
      mtime: 1000,
    });

    xCtx = await setupMcpClient({
      docGraph: xDocGraph,
      codeGraph: xCodeGraph,
      knowledgeGraph: xKnowledgeGraph,
      embedFn: xFakeEmbed,
    });
    xCall = xCtx.call;
  });

  afterAll(async () => {
    await xCtx.close();
  });

  let noteId: string;

  it('create a note first', async () => {
    const res = json<{ noteId: string }>(await xCall('notes_create', {
      title: 'My Note about setup',
      content: 'This note references docs and code.',
      tags: ['cross'],
    }));
    noteId = res.noteId;
    expect(noteId).toMatch(/^[0-9a-f]{8}-/);
  });

  it('notes_create_link to docs node', async () => {
    const res = json<XRelCreateResult>(await xCall('notes_create_link', {
      fromId: noteId,
      toId: 'guide.md::Setup',
      kind: 'references',
      targetGraph: 'docs',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
    expect(res.targetGraph).toBe('docs');
  });

  it('notes_create_link to code node', async () => {
    const res = json<XRelCreateResult>(await xCall('notes_create_link', {
      fromId: noteId,
      toId: 'auth.ts::AuthService',
      kind: 'depends_on',
      targetGraph: 'code',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
    expect(res.targetGraph).toBe('code');
  });

  it('duplicate cross relation returns error', async () => {
    const res = await xCall('notes_create_link', {
      fromId: noteId,
      toId: 'guide.md::Setup',
      kind: 'references',
      targetGraph: 'docs',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('cross relation to nonexistent target returns error', async () => {
    const res = await xCall('notes_create_link', {
      fromId: noteId,
      toId: 'nonexistent::Node',
      kind: 'references',
      targetGraph: 'docs',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('notes_list_links shows cross-graph relations with targetGraph field', async () => {
    const rels = json<RelEntry[]>(await xCall('notes_list_links', { noteId }));
    expect(rels).toHaveLength(2);

    const docsRel = rels.find(r => r.targetGraph === 'docs');
    expect(docsRel).toBeDefined();
    expect(docsRel!.toId).toBe('guide.md::Setup');
    expect(docsRel!.kind).toBe('references');

    const codeRel = rels.find(r => r.targetGraph === 'code');
    expect(codeRel).toBeDefined();
    expect(codeRel!.toId).toBe('auth.ts::AuthService');
    expect(codeRel!.kind).toBe('depends_on');
  });

  it('notes_list does not include proxy nodes', async () => {
    const notes = json<Array<{ id: string }>>(await xCall('notes_list'));
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(noteId);
  });

  it('notes_get on proxy id returns error', async () => {
    const res = await xCall('notes_get', { noteId: '@docs::guide.md::Setup' });
    expect(res.isError).toBe(true);
  });

  it('notes_delete_link with targetGraph removes cross-graph relation', async () => {
    const res = json<{ fromId: string; toId: string; deleted: boolean }>(
      await xCall('notes_delete_link', {
        fromId: noteId,
        toId: 'guide.md::Setup',
        targetGraph: 'docs',
        projectId: 'test',
      }),
    );
    expect(res.deleted).toBe(true);
  });

  it('after delete, only code relation remains', async () => {
    const rels = json<RelEntry[]>(await xCall('notes_list_links', { noteId }));
    expect(rels).toHaveLength(1);
    expect(rels[0].targetGraph).toBe('code');
  });

  it('notes_delete cleans up remaining cross-graph proxy', async () => {
    const del = json<{ deleted: boolean }>(await xCall('notes_delete', { noteId }));
    expect(del.deleted).toBe(true);
    // Knowledge graph should have 0 nodes (note + proxy both cleaned up)
    expect(xKnowledgeGraph.order).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// notes_find_linked
// ---------------------------------------------------------------------------

type LinkedNoteResult = { noteId: string; title: string; kind: string; tags: string[] };

describe('notes_find_linked', () => {
  const fDocGraph = createGraph();
  const fCodeGraph = createCodeGraph();
  const fKnowledgeGraph = createKnowledgeGraph();
  const fFakeEmbed = createFakeEmbed([['note', 10]]);
  let fCtx: McpTestContext;
  let fCall: McpTestContext['call'];
  let fNoteAId: string;
  let fNoteBId: string;

  beforeAll(async () => {
    // Add doc node
    fDocGraph.addNode('api.md::Auth', {
      title: 'Auth',
      content: 'Auth section',
      fileId: 'api.md',
      level: 2,
      embedding: unitVec(0),
      fileEmbedding: [],
      mtime: 1000,
      symbols: [],
    });

    // Add code node
    fCodeGraph.addNode('src/auth.ts::login', {
      kind: 'function' as const,
      name: 'login',
      fileId: 'src/auth.ts',
      signature: 'function login()',
      docComment: '',
      body: 'function login() {}',
      startLine: 1,
      endLine: 3,
      isExported: true,
      embedding: unitVec(1),
      fileEmbedding: [],
      mtime: 1000,
    });

    fCtx = await setupMcpClient({
      docGraph: fDocGraph,
      codeGraph: fCodeGraph,
      knowledgeGraph: fKnowledgeGraph,
      embedFn: fFakeEmbed,
    });
    fCall = fCtx.call;

    // Create two notes that link to the same doc node
    const resA = json<{ noteId: string }>(await fCall('notes_create', { title: 'Note A', content: 'First note', tags: ['a'] }));
    const resB = json<{ noteId: string }>(await fCall('notes_create', { title: 'Note B', content: 'Second note', tags: ['b'] }));
    await fCall('notes_create', { title: 'Note C', content: 'Third note', tags: ['c'] });
    fNoteAId = resA.noteId;
    fNoteBId = resB.noteId;

    await fCall('notes_create_link', { fromId: fNoteAId, toId: 'api.md::Auth', kind: 'references', targetGraph: 'docs', projectId: 'test' });
    await fCall('notes_create_link', { fromId: fNoteBId, toId: 'api.md::Auth', kind: 'documents', targetGraph: 'docs', projectId: 'test' });
    await fCall('notes_create_link', { fromId: fNoteAId, toId: 'src/auth.ts::login', kind: 'depends_on', targetGraph: 'code', projectId: 'test' });
  });

  afterAll(async () => {
    await fCtx.close();
  });

  it('finds all notes linked to a doc node', async () => {
    const results = json<LinkedNoteResult[]>(await fCall('notes_find_linked', {
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      projectId: 'test',
    }));
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.noteId);
    expect(ids).toContain(fNoteAId);
    expect(ids).toContain(fNoteBId);
  });

  it('finds note linked to a code node', async () => {
    const results = json<LinkedNoteResult[]>(await fCall('notes_find_linked', {
      targetId: 'src/auth.ts::login',
      targetGraph: 'code',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].noteId).toBe(fNoteAId);
    expect(results[0].kind).toBe('depends_on');
    expect(results[0].tags).toEqual(['a']);
  });

  it('filters by relation kind', async () => {
    const results = json<LinkedNoteResult[]>(await fCall('notes_find_linked', {
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      kind: 'references',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].noteId).toBe(fNoteAId);
  });

  it('returns message for unlinked target', async () => {
    const res = await fCall('notes_find_linked', {
      targetId: 'nonexistent.md::Foo',
      targetGraph: 'docs',
      projectId: 'test',
    });
    expect(res.isError).toBeUndefined();
    const text = res.content[0].text!;
    expect(text).toContain('No notes linked');
  });

  it('returns empty for target with no links in different graph', async () => {
    const res = await fCall('notes_find_linked', {
      targetId: 'api.md::Auth',
      targetGraph: 'files', // this target is in docs, not files
      projectId: 'test',
    });
    const text = res.content[0].text!;
    expect(text).toContain('No notes linked');
  });
});
