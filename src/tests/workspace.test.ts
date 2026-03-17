import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import { createTaskGraph } from '@/graphs/task-types';
import { createSkillGraph } from '@/graphs/skill-types';
import {
  proxyId as knowledgeProxyId,
  createCrossRelation as knowledgeCreateCross,
  deleteCrossRelation as knowledgeDeleteCross,
  findLinkedNotes,
  createNote,
} from '@/graphs/knowledge';
import {
  proxyId as taskProxyId,
  createCrossRelation as taskCreateCross,
  deleteCrossRelation as taskDeleteCross,
  findLinkedTasks,
  createTask,
} from '@/graphs/task';
import {
  proxyId as skillProxyId,
  createCrossRelation as skillCreateCross,
  deleteCrossRelation as skillDeleteCross,
  findLinkedSkills,
  createSkill,
} from '@/graphs/skill';
import { findIncomingCrossLinks, type ExternalGraphs } from '@/graphs/manager-types';
import { unitVec } from './helpers';

// ---------------------------------------------------------------------------
// Proxy ID formatting
// ---------------------------------------------------------------------------

describe('proxyId with projectId', () => {
  it('knowledge: without projectId — legacy format', () => {
    expect(knowledgeProxyId('docs', 'guide.md::Setup')).toBe('@docs::guide.md::Setup');
  });

  it('knowledge: with projectId — project-scoped format', () => {
    expect(knowledgeProxyId('docs', 'guide.md::Setup', 'frontend')).toBe('@docs::frontend::guide.md::Setup');
  });

  it('task: without projectId — legacy format', () => {
    expect(taskProxyId('code', 'auth.ts::Foo')).toBe('@code::auth.ts::Foo');
  });

  it('task: with projectId — project-scoped format', () => {
    expect(taskProxyId('code', 'auth.ts::Foo', 'backend')).toBe('@code::backend::auth.ts::Foo');
  });

  it('skill: with projectId', () => {
    expect(skillProxyId('files', 'src/index.ts', 'api')).toBe('@files::api::src/index.ts');
  });
});

// ---------------------------------------------------------------------------
// Cross-graph relations with projectId
// ---------------------------------------------------------------------------

describe('knowledge cross-graph with projectId', () => {
  const graph = createKnowledgeGraph();
  let noteId: string;

  beforeAll(() => {
    noteId = createNote(graph, 'Test Note', 'content', ['tag'], unitVec(0));
  });

  it('createCrossRelation with projectId creates project-scoped proxy', () => {
    const ok = knowledgeCreateCross(graph, noteId, 'code', 'auth.ts::Foo', 'references', undefined, 'backend');
    expect(ok).toBe(true);
    expect(graph.hasNode('@code::backend::auth.ts::Foo')).toBe(true);
    const proxy = graph.getNodeAttributes('@code::backend::auth.ts::Foo');
    expect(proxy.proxyFor).toEqual({ graph: 'code', nodeId: 'auth.ts::Foo', projectId: 'backend' });
  });

  it('findLinkedNotes with projectId finds the note', () => {
    const linked = findLinkedNotes(graph, 'code', 'auth.ts::Foo', undefined, 'backend');
    expect(linked).toHaveLength(1);
    expect(linked[0].noteId).toBe(noteId);
  });

  it('findLinkedNotes without projectId does NOT find project-scoped proxy', () => {
    const linked = findLinkedNotes(graph, 'code', 'auth.ts::Foo');
    expect(linked).toHaveLength(0);
  });

  it('deleteCrossRelation with projectId removes project-scoped proxy', () => {
    const ok = knowledgeDeleteCross(graph, noteId, 'code', 'auth.ts::Foo', 'backend');
    expect(ok).toBe(true);
    expect(graph.hasNode('@code::backend::auth.ts::Foo')).toBe(false);
  });

  it('legacy format still works (no projectId)', () => {
    knowledgeCreateCross(graph, noteId, 'docs', 'guide.md::Setup', 'relates_to');
    expect(graph.hasNode('@docs::guide.md::Setup')).toBe(true);
    const linked = findLinkedNotes(graph, 'docs', 'guide.md::Setup');
    expect(linked).toHaveLength(1);
    knowledgeDeleteCross(graph, noteId, 'docs', 'guide.md::Setup');
    expect(graph.hasNode('@docs::guide.md::Setup')).toBe(false);
  });
});

describe('task cross-graph with projectId', () => {
  const graph = createTaskGraph();
  let taskId: string;

  beforeAll(() => {
    taskId = createTask(graph, 'Test Task', 'desc', 'todo', 'medium', [], unitVec(1));
  });

  it('createCrossRelation with projectId creates project-scoped proxy', () => {
    const ok = taskCreateCross(graph, taskId, 'files', 'src/index.ts', 'relates_to', undefined, 'api');
    expect(ok).toBe(true);
    expect(graph.hasNode('@files::api::src/index.ts')).toBe(true);
  });

  it('findLinkedTasks with projectId finds the task', () => {
    const linked = findLinkedTasks(graph, 'files', 'src/index.ts', undefined, 'api');
    expect(linked).toHaveLength(1);
    expect(linked[0].taskId).toBe(taskId);
  });

  it('deleteCrossRelation with projectId works', () => {
    const ok = taskDeleteCross(graph, taskId, 'files', 'src/index.ts', 'api');
    expect(ok).toBe(true);
    expect(graph.hasNode('@files::api::src/index.ts')).toBe(false);
  });
});

describe('skill cross-graph with projectId', () => {
  const graph = createSkillGraph();
  let skillId: string;

  beforeAll(() => {
    skillId = createSkill(graph, 'Test Skill', 'desc', ['step1'], ['trigger1'], [], [], [], 'user', 1, unitVec(2));
  });

  it('createCrossRelation with projectId creates project-scoped proxy', () => {
    const ok = skillCreateCross(graph, skillId, 'code', 'handler.ts::serve', 'implements', undefined, 'server');
    expect(ok).toBe(true);
    expect(graph.hasNode('@code::server::handler.ts::serve')).toBe(true);
  });

  it('findLinkedSkills with projectId finds the skill', () => {
    const linked = findLinkedSkills(graph, 'code', 'handler.ts::serve', undefined, 'server');
    expect(linked).toHaveLength(1);
    expect(linked[0].skillId).toBe(skillId);
  });

  it('deleteCrossRelation with projectId works', () => {
    const ok = skillDeleteCross(graph, skillId, 'code', 'handler.ts::serve', 'server');
    expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findIncomingCrossLinks with projectId
// ---------------------------------------------------------------------------

describe('findIncomingCrossLinks with projectId', () => {
  it('finds project-scoped proxy links', () => {
    const kGraph = createKnowledgeGraph();
    const noteId = createNote(kGraph, 'Deploy Note', 'content', [], unitVec(0));
    knowledgeCreateCross(kGraph, noteId, 'code', 'deploy.ts::run', 'documents', undefined, 'infra');

    const ext: ExternalGraphs = { knowledgeGraph: kGraph };
    const links = findIncomingCrossLinks(ext, 'code', 'deploy.ts::run', 'infra');
    expect(links).toHaveLength(1);
    expect(links[0].sourceId).toBe(noteId);
    expect(links[0].sourceGraph).toBe('knowledge');
    expect(links[0].kind).toBe('documents');
  });

  it('finds legacy proxy links (no projectId)', () => {
    const kGraph = createKnowledgeGraph();
    const noteId = createNote(kGraph, 'Legacy Note', 'content', [], unitVec(0));
    knowledgeCreateCross(kGraph, noteId, 'code', 'old.ts::fn', 'references');

    const ext: ExternalGraphs = { knowledgeGraph: kGraph };
    const links = findIncomingCrossLinks(ext, 'code', 'old.ts::fn');
    expect(links).toHaveLength(1);
  });

  it('finds both legacy and project-scoped links', () => {
    const kGraph = createKnowledgeGraph();
    const note1 = createNote(kGraph, 'Note A', 'content', [], unitVec(0));
    const note2 = createNote(kGraph, 'Note B', 'content', [], unitVec(1));

    // Legacy link from note1
    knowledgeCreateCross(kGraph, note1, 'code', 'shared.ts::fn', 'uses');
    // Project-scoped link from note2
    knowledgeCreateCross(kGraph, note2, 'code', 'shared.ts::fn', 'references', undefined, 'proj-a');

    const ext: ExternalGraphs = { knowledgeGraph: kGraph };
    const links = findIncomingCrossLinks(ext, 'code', 'shared.ts::fn', 'proj-a');
    expect(links).toHaveLength(2);
    const sourceIds = links.map(l => l.sourceId).sort();
    expect(sourceIds).toEqual([note1, note2].sort());
  });
});
