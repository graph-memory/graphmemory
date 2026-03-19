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

  // ── create_note ──

  it('create_note: first note returns slug noteId', async () => {
    note1 = json<CreateNoteResult>(await call('create_note', {
      title: 'Auth JWT Knowledge',
      content: 'The system uses JWT for authentication.',
      tags: ['auth', 'security'],
    }));
    expect(typeof note1.noteId).toBe('string');
    expect(note1.noteId).toBe('auth-jwt-knowledge');
  });

  it('create_note: second note', async () => {
    note2 = json<CreateNoteResult>(await call('create_note', {
      title: 'Database Postgres',
      content: 'We use PostgreSQL 15 for persistence.',
      tags: ['infra'],
    }));
    expect(note2.noteId).toBe('database-postgres');
  });

  it('create_note: third note', async () => {
    note3 = json<CreateNoteResult>(await call('create_note', {
      title: 'Rate Limit API',
      content: 'API rate limited to 100 req/min.',
      tags: ['api'],
    }));
    expect(note3.noteId).toBe('rate-limit-api');
  });

  // ── get_note ──

  it('get_note: returns correct fields', async () => {
    const gotNote = json<NoteResult>(await call('get_note', { noteId: note1.noteId }));
    expect(gotNote.id).toBe(note1.noteId);
    expect(gotNote.title).toBe('Auth JWT Knowledge');
    expect(gotNote.content).toContain('JWT');
    expect(gotNote.tags).toHaveLength(2);
    expect(gotNote.createdAt).toBeGreaterThan(0);
    expect(gotNote).not.toHaveProperty('embedding');
  });

  it('get_note: missing note returns isError', async () => {
    const gotMissing = await call('get_note', { noteId: 'ghost' });
    expect(gotMissing.isError).toBe(true);
  });

  // ── list_notes (before update) ──

  it('list_notes: returns all 3 notes', async () => {
    const allNotes = json<NoteListEntry[]>(await call('list_notes'));
    expect(allNotes).toHaveLength(3);
    expect(allNotes.every(n => n.id && n.title)).toBe(true);
  });

  it('list_notes: filter "auth" matches 1 note', async () => {
    const filteredNotes = json<NoteListEntry[]>(await call('list_notes', { filter: 'auth' }));
    expect(filteredNotes).toHaveLength(1);
    expect(filteredNotes[0].id).toBe(note1.noteId);
  });

  it('list_notes: tag "infra" matches 1 note', async () => {
    const taggedNotes = json<NoteListEntry[]>(await call('list_notes', { tag: 'infra' }));
    expect(taggedNotes).toHaveLength(1);
    expect(taggedNotes[0].id).toBe(note2.noteId);
  });

  it('list_notes: limit=1 returns 1 note', async () => {
    const limitedNotes = json<NoteListEntry[]>(await call('list_notes', { limit: 1 }));
    expect(limitedNotes).toHaveLength(1);
  });

  it('list_notes: filter no match returns empty', async () => {
    const noNotes = json<NoteListEntry[]>(await call('list_notes', { filter: 'nonexistent' }));
    expect(noNotes).toHaveLength(0);
  });

  // ── update_note ──

  it('update_note: updates content and tags, title unchanged', async () => {
    const upd = json<UpdateResult>(await call('update_note', {
      noteId: note1.noteId,
      content: 'Updated: JWT with refresh token support.',
      tags: ['auth', 'security', 'jwt'],
    }));
    expect(upd.updated).toBe(true);

    const updatedNote = json<NoteResult>(await call('get_note', { noteId: note1.noteId }));
    expect(updatedNote.content).toContain('refresh token');
    expect(updatedNote.tags).toHaveLength(3);
    expect(updatedNote.title).toBe('Auth JWT Knowledge');
  });

  it('update_note: missing note returns isError', async () => {
    const updMissing = await call('update_note', { noteId: 'ghost', content: 'x' });
    expect(updMissing.isError).toBe(true);
  });

  // ── create_relation ──

  it('create_relation: creates depends_on relation', async () => {
    const rel1 = json<RelCreateResult>(await call('create_relation', {
      fromId: note1.noteId, toId: note2.noteId, kind: 'depends_on', projectId: 'test',
    }));
    expect(rel1.created).toBe(true);
    expect(rel1.fromId).toBe(note1.noteId);
    expect(rel1.kind).toBe('depends_on');
  });

  it('create_relation: creates relates_to relation', async () => {
    const rel2 = json<RelCreateResult>(await call('create_relation', {
      fromId: note2.noteId, toId: note3.noteId, kind: 'relates_to', projectId: 'test',
    }));
    expect(rel2.created).toBe(true);
  });

  it('create_relation: duplicate returns isError', async () => {
    const relDup = await call('create_relation', {
      fromId: note1.noteId, toId: note2.noteId, kind: 'depends_on', projectId: 'test',
    });
    expect(relDup.isError).toBe(true);
  });

  it('create_relation: missing node returns isError', async () => {
    const relGhost = await call('create_relation', {
      fromId: note1.noteId, toId: 'ghost', kind: 'x', projectId: 'test',
    });
    expect(relGhost.isError).toBe(true);
  });

  // ── list_relations ──

  it('list_relations: note1 has 1 relation', async () => {
    const rels1 = json<RelEntry[]>(await call('list_relations', { noteId: note1.noteId }));
    expect(rels1).toHaveLength(1);
    expect(rels1[0].kind).toBe('depends_on');
  });

  it('list_relations: note2 has 2 relations (in + out)', async () => {
    const rels2 = json<RelEntry[]>(await call('list_relations', { noteId: note2.noteId }));
    expect(rels2).toHaveLength(2);
  });

  // ── search_notes ──

  it('search_notes: exact match returns score 1.0', async () => {
    const kHits1 = json<KnowledgeHit[]>(await call('search_notes', { query: 'auth jwt knowledge', topK: 1, bfsDepth: 0, searchMode: 'vector' }));
    expect(kHits1).toHaveLength(1);
    expect(kHits1[0].id).toBe(note1.noteId);
    expect(kHits1[0].score).toBe(1.0);
    expect(typeof kHits1[0].title).toBe('string');
    expect(typeof kHits1[0].content).toBe('string');
    expect(Array.isArray(kHits1[0].tags)).toBe(true);
  });

  it('search_notes: BFS depth=1 includes seed and depends_on neighbor', async () => {
    const kHits2 = json<KnowledgeHit[]>(await call('search_notes', { query: 'auth jwt knowledge', topK: 1, bfsDepth: 1, searchMode: 'vector' }));
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

  it('search_notes: BFS depth=2 reaches rate-limit', async () => {
    const kHits3 = json<KnowledgeHit[]>(await call('search_notes', { query: 'auth jwt knowledge', topK: 1, bfsDepth: 2, minScore: 0 }));
    const kIds3 = kHits3.map(h => h.id);
    expect(kIds3).toContain(note3.noteId);
  });

  it('search_notes: minScore=0.9 returns only seed', async () => {
    const kHitsMin = json<KnowledgeHit[]>(await call('search_notes', { query: 'auth jwt knowledge', topK: 1, bfsDepth: 1, minScore: 0.9, searchMode: 'vector' }));
    expect(kHitsMin).toHaveLength(1);
    expect(kHitsMin[0].id).toBe(note1.noteId);
  });

  it('search_notes: vector-only mode returns results', async () => {
    const hits = json<KnowledgeHit[]>(await call('search_notes', {
      query: 'database postgres',
      topK: 3,
      bfsDepth: 0,
      searchMode: 'vector',
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(note2.noteId);
    expect(hits[0].score).toBeGreaterThan(0.5);
  });

  it('search_notes: keyword-only mode returns results', async () => {
    const hits = json<KnowledgeHit[]>(await call('search_notes', {
      query: 'PostgreSQL persistence',
      topK: 3,
      bfsDepth: 0,
      searchMode: 'keyword',
      minScore: 0,
    }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(note2.noteId);
  });

  it('search_notes: unknown query returns empty', async () => {
    const kHitsNone = json<KnowledgeHit[]>(await call('search_notes', { query: 'xyzzy completely unknown xyz', minScore: 0.1, searchMode: 'keyword' }));
    expect(kHitsNone).toHaveLength(0);
  });

  // ── delete_relation ──

  it('delete_relation: deletes existing relation', async () => {
    const relDel = json<RelDelResult>(await call('delete_relation', { fromId: note1.noteId, toId: note2.noteId, projectId: 'test' }));
    expect(relDel.deleted).toBe(true);
  });

  it('delete_relation: missing relation returns isError', async () => {
    const relDelMissing = await call('delete_relation', { fromId: note1.noteId, toId: note2.noteId, projectId: 'test' });
    expect(relDelMissing.isError).toBe(true);
  });

  it('delete_relation: note1 has 0 relations after delete', async () => {
    const relsAfterDel = json<RelEntry[]>(await call('list_relations', { noteId: note1.noteId }));
    expect(relsAfterDel).toHaveLength(0);
  });

  // ── delete_note ──

  it('delete_note: deletes note and cleans up relations', async () => {
    const del = json<DelResult>(await call('delete_note', { noteId: note3.noteId }));
    expect(del.deleted).toBe(true);
  });

  it('delete_note: missing note returns isError', async () => {
    const delMissing = await call('delete_note', { noteId: 'ghost' });
    expect(delMissing.isError).toBe(true);
  });

  it('delete_note: 2 notes remain after delete', async () => {
    const remainingNotes = json<NoteListEntry[]>(await call('list_notes'));
    expect(remainingNotes).toHaveLength(2);
  });

  it('delete_note: note2 relations cleaned up after note3 delete', async () => {
    const relsNote2 = json<RelEntry[]>(await call('list_relations', { noteId: note2.noteId }));
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
    const res = json<{ noteId: string }>(await xCall('create_note', {
      title: 'My Note about setup',
      content: 'This note references docs and code.',
      tags: ['cross'],
    }));
    noteId = res.noteId;
    expect(noteId).toBe('my-note-about-setup');
  });

  it('create_relation to docs node', async () => {
    const res = json<XRelCreateResult>(await xCall('create_relation', {
      fromId: noteId,
      toId: 'guide.md::Setup',
      kind: 'references',
      targetGraph: 'docs',
      projectId: 'test',
    }));
    expect(res.created).toBe(true);
    expect(res.targetGraph).toBe('docs');
  });

  it('create_relation to code node', async () => {
    const res = json<XRelCreateResult>(await xCall('create_relation', {
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
    const res = await xCall('create_relation', {
      fromId: noteId,
      toId: 'guide.md::Setup',
      kind: 'references',
      targetGraph: 'docs',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('cross relation to nonexistent target returns error', async () => {
    const res = await xCall('create_relation', {
      fromId: noteId,
      toId: 'nonexistent::Node',
      kind: 'references',
      targetGraph: 'docs',
      projectId: 'test',
    });
    expect(res.isError).toBe(true);
  });

  it('list_relations shows cross-graph relations with targetGraph field', async () => {
    const rels = json<RelEntry[]>(await xCall('list_relations', { noteId }));
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

  it('list_notes does not include proxy nodes', async () => {
    const notes = json<Array<{ id: string }>>(await xCall('list_notes'));
    expect(notes).toHaveLength(1);
    expect(notes[0].id).toBe(noteId);
  });

  it('get_note on proxy id returns error', async () => {
    const res = await xCall('get_note', { noteId: '@docs::guide.md::Setup' });
    expect(res.isError).toBe(true);
  });

  it('delete_relation with targetGraph removes cross-graph relation', async () => {
    const res = json<{ fromId: string; toId: string; deleted: boolean }>(
      await xCall('delete_relation', {
        fromId: noteId,
        toId: 'guide.md::Setup',
        targetGraph: 'docs',
        projectId: 'test',
      }),
    );
    expect(res.deleted).toBe(true);
  });

  it('after delete, only code relation remains', async () => {
    const rels = json<RelEntry[]>(await xCall('list_relations', { noteId }));
    expect(rels).toHaveLength(1);
    expect(rels[0].targetGraph).toBe('code');
  });

  it('delete_note cleans up remaining cross-graph proxy', async () => {
    const del = json<{ deleted: boolean }>(await xCall('delete_note', { noteId }));
    expect(del.deleted).toBe(true);
    // Knowledge graph should have 0 nodes (note + proxy both cleaned up)
    expect(xKnowledgeGraph.order).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// find_linked_notes
// ---------------------------------------------------------------------------

type LinkedNoteResult = { noteId: string; title: string; kind: string; tags: string[] };

describe('find_linked_notes', () => {
  const fDocGraph = createGraph();
  const fCodeGraph = createCodeGraph();
  const fKnowledgeGraph = createKnowledgeGraph();
  const fFakeEmbed = createFakeEmbed([['note', 10]]);
  let fCtx: McpTestContext;
  let fCall: McpTestContext['call'];

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
    await fCall('create_note', { title: 'Note A', content: 'First note', tags: ['a'] });
    await fCall('create_note', { title: 'Note B', content: 'Second note', tags: ['b'] });
    await fCall('create_note', { title: 'Note C', content: 'Third note', tags: ['c'] });

    await fCall('create_relation', { fromId: 'note-a', toId: 'api.md::Auth', kind: 'references', targetGraph: 'docs', projectId: 'test' });
    await fCall('create_relation', { fromId: 'note-b', toId: 'api.md::Auth', kind: 'documents', targetGraph: 'docs', projectId: 'test' });
    await fCall('create_relation', { fromId: 'note-a', toId: 'src/auth.ts::login', kind: 'depends_on', targetGraph: 'code', projectId: 'test' });
  });

  afterAll(async () => {
    await fCtx.close();
  });

  it('finds all notes linked to a doc node', async () => {
    const results = json<LinkedNoteResult[]>(await fCall('find_linked_notes', {
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      projectId: 'test',
    }));
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.noteId);
    expect(ids).toContain('note-a');
    expect(ids).toContain('note-b');
  });

  it('finds note linked to a code node', async () => {
    const results = json<LinkedNoteResult[]>(await fCall('find_linked_notes', {
      targetId: 'src/auth.ts::login',
      targetGraph: 'code',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].noteId).toBe('note-a');
    expect(results[0].kind).toBe('depends_on');
    expect(results[0].tags).toEqual(['a']);
  });

  it('filters by relation kind', async () => {
    const results = json<LinkedNoteResult[]>(await fCall('find_linked_notes', {
      targetId: 'api.md::Auth',
      targetGraph: 'docs',
      kind: 'references',
      projectId: 'test',
    }));
    expect(results).toHaveLength(1);
    expect(results[0].noteId).toBe('note-a');
  });

  it('returns message for unlinked target', async () => {
    const res = await fCall('find_linked_notes', {
      targetId: 'nonexistent.md::Foo',
      targetGraph: 'docs',
      projectId: 'test',
    });
    expect(res.isError).toBeUndefined();
    const text = res.content[0].text!;
    expect(text).toContain('No notes linked');
  });

  it('returns empty for target with no links in different graph', async () => {
    const res = await fCall('find_linked_notes', {
      targetId: 'api.md::Auth',
      targetGraph: 'files', // this target is in docs, not files
      projectId: 'test',
    });
    const text = res.content[0].text!;
    expect(text).toContain('No notes linked');
  });
});
