import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import { KnowledgeGraphManager } from '@/graphs/knowledge';
import { createTaskGraph } from '@/graphs/task-types';
import { TaskGraphManager } from '@/graphs/task';
import { createSkillGraph } from '@/graphs/skill-types';
import { SkillGraphManager } from '@/graphs/skill';
import { unitVec, DIM } from '@/tests/helpers';

const fakeEmbed = async () => unitVec(0, DIM);
const embedFns = { document: fakeEmbed, query: fakeEmbed };

function makeCtx() {
  const events: Array<[string, any]> = [];
  return {
    markDirty: () => {},
    emit: (event: string, data: any) => { events.push([event, data]); },
    projectId: 'test',
    events,
  } as any;
}

describe('Relation events', () => {
  describe('Knowledge graph', () => {
    let mgr: KnowledgeGraphManager;
    let ctx: ReturnType<typeof makeCtx>;
    let idA: string, idB: string;

    beforeEach(async () => {
      ctx = makeCtx();
      const graph = createKnowledgeGraph();
      mgr = new KnowledgeGraphManager(graph, embedFns, ctx);
      idA = await mgr.createNote('Note A', 'content a');
      idB = await mgr.createNote('Note B', 'content b');
      ctx.events.length = 0; // clear creation events
    });

    it('emits note:relation:added on createRelation', () => {
      const ok = mgr.createRelation(idA, idB, 'depends_on');
      expect(ok).toBe(true);
      const ev = ctx.events.find(([e]: [string, any]) => e === 'note:relation:added');
      expect(ev).toBeDefined();
      expect(ev![1]).toMatchObject({ noteId: idA, toId: idB, kind: 'depends_on' });
    });

    it('emits note:relation:deleted on deleteRelation', () => {
      mgr.createRelation(idA, idB, 'depends_on');
      ctx.events.length = 0;

      const ok = mgr.deleteRelation(idA, idB);
      expect(ok).toBe(true);
      const ev = ctx.events.find(([e]: [string, any]) => e === 'note:relation:deleted');
      expect(ev).toBeDefined();
      expect(ev![1]).toMatchObject({ noteId: idA, toId: idB });
    });

    it('does not emit on failed createRelation', () => {
      mgr.createRelation('nonexistent', idB, 'refs');
      expect(ctx.events.find(([e]: [string, any]) => e === 'note:relation:added')).toBeUndefined();
    });
  });

  describe('Task graph', () => {
    let mgr: TaskGraphManager;
    let ctx: ReturnType<typeof makeCtx>;
    let idA: string, idB: string;

    beforeEach(async () => {
      ctx = makeCtx();
      const graph = createTaskGraph();
      mgr = new TaskGraphManager(graph, embedFns, ctx);
      idA = await mgr.createTask('Task A', 'desc', 'todo', 'medium');
      idB = await mgr.createTask('Task B', 'desc', 'todo', 'medium');
      ctx.events.length = 0;
    });

    it('emits task:relation:added on linkTasks', () => {
      const ok = mgr.linkTasks(idA, idB, 'blocks');
      expect(ok).toBe(true);
      const ev = ctx.events.find(([e]: [string, any]) => e === 'task:relation:added');
      expect(ev).toBeDefined();
      expect(ev![1]).toMatchObject({ taskId: idA, toId: idB, kind: 'blocks' });
    });

    it('emits task:relation:deleted on deleteTaskLink', () => {
      mgr.linkTasks(idA, idB, 'blocks');
      ctx.events.length = 0;

      const ok = mgr.deleteTaskLink(idA, idB);
      expect(ok).toBe(true);
      const ev = ctx.events.find(([e]: [string, any]) => e === 'task:relation:deleted');
      expect(ev).toBeDefined();
    });
  });

  describe('Skill graph', () => {
    let mgr: SkillGraphManager;
    let ctx: ReturnType<typeof makeCtx>;
    let idA: string, idB: string;

    beforeEach(async () => {
      ctx = makeCtx();
      const graph = createSkillGraph();
      mgr = new SkillGraphManager(graph, embedFns, ctx);
      idA = await mgr.createSkill('Skill A', 'desc');
      idB = await mgr.createSkill('Skill B', 'desc');
      ctx.events.length = 0;
    });

    it('emits skill:relation:added on linkSkills', () => {
      const ok = mgr.linkSkills(idA, idB, 'related_to');
      expect(ok).toBe(true);
      const ev = ctx.events.find(([e]: [string, any]) => e === 'skill:relation:added');
      expect(ev).toBeDefined();
      expect(ev![1]).toMatchObject({ skillId: idA, toId: idB, kind: 'related_to' });
    });

    it('emits skill:relation:deleted on deleteSkillLink', () => {
      mgr.linkSkills(idA, idB, 'related_to');
      ctx.events.length = 0;

      const ok = mgr.deleteSkillLink(idA, idB);
      expect(ok).toBe(true);
      const ev = ctx.events.find(([e]: [string, any]) => e === 'skill:relation:deleted');
      expect(ev).toBeDefined();
    });
  });
});
