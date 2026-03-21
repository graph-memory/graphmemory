// Jest test for MCP readonly graphs and per-user access control.
// Verifies that readonlyGraphs hides mutation tools, and userAccess
// controls tool visibility (deny hides all, 'r' hides mutations).

import { createKnowledgeGraph } from '@/graphs/knowledge-types';
import { createTaskGraph } from '@/graphs/task-types';
import { createSkillGraph } from '@/graphs/skill-types';
import { createMcpServer } from '@/api/index';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { AccessLevel } from '@/lib/multi-config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeEmbed = async (_text: string): Promise<number[]> => Array(384).fill(0);

async function listToolNames(
  readonlyGraphs?: Set<string>,
  userAccess?: Map<string, AccessLevel>,
): Promise<string[]> {
  const kg = createKnowledgeGraph();
  const tg = createTaskGraph();
  const sg = createSkillGraph();

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(
    undefined,   // docGraph
    undefined,   // codeGraph
    kg,          // knowledgeGraph
    undefined,   // fileIndexGraph
    tg,          // taskGraph
    fakeEmbed,   // embedFn
    undefined,   // mutationQueue
    undefined,   // projectDir
    sg,          // skillGraph
    undefined,   // sessionContext
    readonlyGraphs,
    userAccess,
  );
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-readonly', version: '1.0.0' });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  const names = tools.map((t: { name: string }) => t.name).sort();

  await client.close();
  await server.close();

  return names;
}

// ---------------------------------------------------------------------------
// Expected tool sets
// ---------------------------------------------------------------------------

const KNOWLEDGE_READ = [
  'get_note', 'list_notes', 'search_notes', 'list_relations', 'find_linked_notes',
].sort();

const KNOWLEDGE_MUTATION = [
  'create_note', 'update_note', 'delete_note',
  'create_relation', 'delete_relation',
  'add_note_attachment', 'remove_note_attachment',
].sort();

const TASK_READ = [
  'get_task', 'list_tasks', 'search_tasks', 'find_linked_tasks',
].sort();

const TASK_MUTATION = [
  'create_task', 'update_task', 'delete_task', 'move_task',
  'link_task', 'create_task_link', 'delete_task_link',
  'add_task_attachment', 'remove_task_attachment',
].sort();

const SKILL_READ = [
  'get_skill', 'list_skills', 'search_skills', 'find_linked_skills', 'recall_skills',
].sort();

const SKILL_MUTATION = [
  'create_skill', 'update_skill', 'delete_skill',
  'link_skill', 'create_skill_link', 'delete_skill_link',
  'add_skill_attachment', 'remove_skill_attachment', 'bump_skill_usage',
].sort();

const ALL_TOOLS_COUNT = KNOWLEDGE_READ.length + KNOWLEDGE_MUTATION.length
  + TASK_READ.length + TASK_MUTATION.length
  + SKILL_READ.length + SKILL_MUTATION.length
  + 1; // get_context

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP readonly graphs', () => {
  it('no restrictions — all tools visible', async () => {
    const names = await listToolNames();
    expect(names.length).toBe(ALL_TOOLS_COUNT); // 40
    expect(names).toContain('get_context');
    for (const t of [...KNOWLEDGE_READ, ...KNOWLEDGE_MUTATION]) expect(names).toContain(t);
    for (const t of [...TASK_READ, ...TASK_MUTATION]) expect(names).toContain(t);
    for (const t of [...SKILL_READ, ...SKILL_MUTATION]) expect(names).toContain(t);
  });

  it('knowledge readonly — hides 7 knowledge mutation tools', async () => {
    const names = await listToolNames(new Set(['knowledge']));
    expect(names.length).toBe(ALL_TOOLS_COUNT - KNOWLEDGE_MUTATION.length); // 33
    for (const t of KNOWLEDGE_READ) expect(names).toContain(t);
    for (const t of KNOWLEDGE_MUTATION) expect(names).not.toContain(t);
  });

  it('tasks readonly — hides 9 task mutation tools', async () => {
    const names = await listToolNames(new Set(['tasks']));
    expect(names.length).toBe(ALL_TOOLS_COUNT - TASK_MUTATION.length); // 31
    for (const t of TASK_READ) expect(names).toContain(t);
    for (const t of TASK_MUTATION) expect(names).not.toContain(t);
  });

  it('skills readonly — hides 9 skill mutation tools', async () => {
    const names = await listToolNames(new Set(['skills']));
    expect(names.length).toBe(ALL_TOOLS_COUNT - SKILL_MUTATION.length); // 31
    for (const t of SKILL_READ) expect(names).toContain(t);
    for (const t of SKILL_MUTATION) expect(names).not.toContain(t);
  });

  it('all three readonly — only read tools + get_context visible', async () => {
    const names = await listToolNames(new Set(['knowledge', 'tasks', 'skills']));
    const readCount = KNOWLEDGE_READ.length + TASK_READ.length + SKILL_READ.length + 1;
    expect(names.length).toBe(readCount); // 15
    for (const t of KNOWLEDGE_READ) expect(names).toContain(t);
    for (const t of TASK_READ) expect(names).toContain(t);
    for (const t of SKILL_READ) expect(names).toContain(t);
    expect(names).toContain('get_context');
  });
});

describe('MCP per-user access', () => {
  it('knowledge "r" — same as readonly, mutation tools hidden', async () => {
    const access = new Map<string, AccessLevel>([['knowledge', 'r']]);
    const names = await listToolNames(undefined, access);
    expect(names.length).toBe(ALL_TOOLS_COUNT - KNOWLEDGE_MUTATION.length); // 33
    for (const t of KNOWLEDGE_READ) expect(names).toContain(t);
    for (const t of KNOWLEDGE_MUTATION) expect(names).not.toContain(t);
  });

  it('knowledge "deny" — all knowledge tools hidden', async () => {
    const access = new Map<string, AccessLevel>([['knowledge', 'deny']]);
    const names = await listToolNames(undefined, access);
    const hiddenCount = KNOWLEDGE_READ.length + KNOWLEDGE_MUTATION.length;
    expect(names.length).toBe(ALL_TOOLS_COUNT - hiddenCount); // 28
    for (const t of [...KNOWLEDGE_READ, ...KNOWLEDGE_MUTATION]) expect(names).not.toContain(t);
    // Tasks and skills still visible
    for (const t of [...TASK_READ, ...TASK_MUTATION]) expect(names).toContain(t);
    for (const t of [...SKILL_READ, ...SKILL_MUTATION]) expect(names).toContain(t);
  });

  it('all graphs "r" — same as all readonly', async () => {
    const access = new Map<string, AccessLevel>([
      ['knowledge', 'r'],
      ['tasks', 'r'],
      ['skills', 'r'],
    ]);
    const names = await listToolNames(undefined, access);
    const readCount = KNOWLEDGE_READ.length + TASK_READ.length + SKILL_READ.length + 1;
    expect(names.length).toBe(readCount); // 15
  });

  it('read tools still work when knowledge is readonly', async () => {
    const kg = createKnowledgeGraph();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const server = createMcpServer(
      undefined, undefined, kg, undefined, undefined,
      fakeEmbed,
      undefined, undefined, undefined, undefined,
      new Set(['knowledge']),
    );
    await server.connect(serverTransport);

    const client = new Client({ name: 'test-readonly-call', version: '1.0.0' });
    await client.connect(clientTransport);

    // search_notes should still work (read tool) even on a readonly graph
    const result = await client.callTool({
      name: 'search_notes',
      arguments: { query: 'test query', limit: 5 },
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');
    // Empty graph → expect empty results, not an error
    const parsed = JSON.parse(result.content[0].text);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(0);

    await client.close();
    await server.close();
  });
});
