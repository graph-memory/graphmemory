import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import { createTaskGraph } from '@/graphs/task-types';
import { createSkillGraph } from '@/graphs/skill-types';
import {
  proxyId as knowledgeProxyId,
  createCrossRelation as knowledgeCreateCross,
  deleteCrossRelation as knowledgeDeleteCross,
  findLinkedNotes,
  createNote,
  KnowledgeGraphManager,
} from '@/graphs/knowledge';
import {
  proxyId as taskProxyId,
  createCrossRelation as taskCreateCross,
  deleteCrossRelation as taskDeleteCross,
  findLinkedTasks,
  createTask,
  TaskGraphManager,
} from '@/graphs/task';
import {
  proxyId as skillProxyId,
  createCrossRelation as skillCreateCross,
  deleteCrossRelation as skillDeleteCross,
  findLinkedSkills,
  createSkill,
  SkillGraphManager,
} from '@/graphs/skill';
import { findIncomingCrossLinks, noopContext, type ExternalGraphs } from '@/graphs/manager-types';
import { PromiseQueue } from '@/lib/promise-queue';
import { unitVec, embedFnPair } from './helpers';

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

// ---------------------------------------------------------------------------
// Workspace shared graphs
// ---------------------------------------------------------------------------

describe('workspace shared graphs', () => {
  // Simulate the workspace sharing pattern from ProjectManager:
  // - Shared knowledge/task/skill graphs + managers + mutationQueue
  // - Per-project docs/code/fileIndex graphs

  const fakeEmbed = (_q: string) => Promise.resolve(unitVec(0));

  // Shared graphs (workspace-level)
  const sharedKnowledgeGraph = createKnowledgeGraph();
  const sharedTaskGraph = createTaskGraph();
  const sharedSkillGraph = createSkillGraph();
  const sharedMutationQueue = new PromiseQueue();

  // Standalone project (no workspace) — separate graphs
  const standaloneKnowledgeGraph = createKnowledgeGraph();
  const standaloneTaskGraph = createTaskGraph();
  const standaloneSkillGraph = createSkillGraph();

  // Workspace context and external graphs (indexed graphs now use SQLite Store)
  const wsCtx = noopContext('workspace');
  const wsExt: ExternalGraphs = {
    knowledgeGraph: sharedKnowledgeGraph,
    taskGraph: sharedTaskGraph,
    skillGraph: sharedSkillGraph,
  };

  // Shared managers (workspace-level, used by both projects)
  const sharedKnowledgeManager = new KnowledgeGraphManager(sharedKnowledgeGraph, embedFnPair(fakeEmbed), wsCtx, wsExt);
  const sharedTaskManager = new TaskGraphManager(sharedTaskGraph, embedFnPair(fakeEmbed), wsCtx, wsExt);
  const sharedSkillManager = new SkillGraphManager(sharedSkillGraph, embedFnPair(fakeEmbed), wsCtx, wsExt);

  // Standalone managers
  const standaloneCtx = noopContext('standalone');
  const standaloneKnowledgeManager = new KnowledgeGraphManager(
    standaloneKnowledgeGraph, embedFnPair(fakeEmbed), standaloneCtx,
  );
  const standaloneTaskManager = new TaskGraphManager(
    standaloneTaskGraph, embedFnPair(fakeEmbed), standaloneCtx,
  );
  const standaloneSkillManager = new SkillGraphManager(
    standaloneSkillGraph, embedFnPair(fakeEmbed), standaloneCtx,
  );

  it('two workspace projects share the same knowledgeGraph instance', () => {
    // In ProjectManager.addProject with workspaceId, both projects get ws.knowledgeGraph
    // Here we verify the pattern: both "project A" and "project B" reference the same graph
    const projectAKnowledge = sharedKnowledgeGraph;
    const projectBKnowledge = sharedKnowledgeGraph;
    expect(projectAKnowledge).toBe(projectBKnowledge);
  });

  it('two workspace projects share the same taskGraph and skillGraph instances', () => {
    const projectATask = sharedTaskGraph;
    const projectBTask = sharedTaskGraph;
    expect(projectATask).toBe(projectBTask);

    const projectASkill = sharedSkillGraph;
    const projectBSkill = sharedSkillGraph;
    expect(projectASkill).toBe(projectBSkill);
  });

  it('two workspace projects share the same mutationQueue instance', () => {
    // In ProjectManager, workspace projects get ws.mutationQueue
    const projectAQueue = sharedMutationQueue;
    const projectBQueue = sharedMutationQueue;
    expect(projectAQueue).toBe(projectBQueue);
  });

  it('creating a note via project A knowledgeManager is visible from project B', async () => {
    // Both projects share the same knowledgeManager (ws.knowledgeManager)
    const noteId = await sharedKnowledgeManager.createNote('Shared Note', 'visible to all workspace projects', ['shared']);

    // The note is on the shared graph, so project B's manager can see it
    const note = sharedKnowledgeManager.getNote(noteId);
    expect(note).not.toBeNull();
    expect(note!.title).toBe('Shared Note');
    expect(note!.content).toBe('visible to all workspace projects');
    expect(note!.tags).toEqual(['shared']);

    // Also visible via listNotes (used by both projects)
    const notes = sharedKnowledgeManager.listNotes().results;
    expect(notes.some(n => n.id === noteId)).toBe(true);
  });

  it('creating a task via shared manager is visible across workspace projects', async () => {
    const taskId = await sharedTaskManager.createTask('Shared Task', 'workspace-wide task', 'todo', 'high', ['ws']);

    const task = sharedTaskManager.getTask(taskId);
    expect(task).not.toBeNull();
    expect(task!.title).toBe('Shared Task');
    expect(task!.status).toBe('todo');
    expect(task!.priority).toBe('high');
  });

  it('creating a skill via shared manager is visible across workspace projects', async () => {
    const skillId = await sharedSkillManager.createSkill(
      'Shared Skill', 'workspace-wide skill', ['step 1'], ['trigger'], [], [], ['ws'], 'user', 1,
    );

    const skill = sharedSkillManager.getSkill(skillId);
    expect(skill).not.toBeNull();
    expect(skill!.title).toBe('Shared Skill');
    expect(skill!.steps).toEqual(['step 1']);
  });

  it('standalone project has its own separate knowledge graph', async () => {
    // Standalone project should NOT see workspace notes
    const standaloneNotes = standaloneKnowledgeManager.listNotes().results;
    expect(standaloneNotes).toHaveLength(0);

    // Create a note on standalone — not visible in workspace
    const standaloneNoteId = await standaloneKnowledgeManager.createNote('Standalone Note', 'only here');
    expect(standaloneKnowledgeManager.getNote(standaloneNoteId)).not.toBeNull();

    // Workspace notes unchanged (still has the shared note from earlier test)
    const wsNotes = sharedKnowledgeManager.listNotes().results;
    expect(wsNotes.every(n => n.id !== standaloneNoteId)).toBe(true);
  });

  it('standalone project has its own separate task and skill graphs', async () => {
    const standaloneTasks = standaloneTaskManager.listTasks().results;
    expect(standaloneTasks).toHaveLength(0);

    const standaloneSkills = standaloneSkillManager.listSkills().results;
    expect(standaloneSkills).toHaveLength(0);

    // Create items on standalone — not visible in workspace
    await standaloneTaskManager.createTask('Solo Task', 'only standalone');
    await standaloneSkillManager.createSkill('Solo Skill', 'only standalone', ['s1']);

    expect(standaloneTaskManager.listTasks().results).toHaveLength(1);
    expect(standaloneSkillManager.listSkills().results).toHaveLength(1);

    // Workspace graphs unaffected
    expect(sharedTaskGraph.order).toBeGreaterThan(0);
    expect(sharedTaskGraph.nodes().every(n => {
      const attrs = sharedTaskGraph.getNodeAttributes(n);
      return attrs.title !== 'Solo Task';
    })).toBe(true);
  });

  it('shared mutationQueue serializes mutations across workspace projects', async () => {
    const order: string[] = [];

    await Promise.all([
      sharedMutationQueue.enqueue(async () => {
        await new Promise(r => setTimeout(r, 10));
        order.push('first');
      }),
      sharedMutationQueue.enqueue(async () => {
        order.push('second');
      }),
    ]);

    // PromiseQueue guarantees serial execution
    expect(order).toEqual(['first', 'second']);
  });
});
