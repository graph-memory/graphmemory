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
  'notes_get', 'notes_list', 'notes_search', 'notes_list_links', 'notes_find_linked',
].sort();

const KNOWLEDGE_MUTATION = [
  'notes_create', 'notes_update', 'notes_delete',
  'notes_create_link', 'notes_delete_link',
  'notes_add_attachment', 'notes_remove_attachment',
].sort();

const TASK_READ = [
  'tasks_get', 'tasks_list', 'tasks_search', 'tasks_find_linked',
].sort();

const TASK_MUTATION = [
  'tasks_create', 'tasks_update', 'tasks_delete', 'tasks_move', 'tasks_reorder',
  'tasks_bulk_move', 'tasks_bulk_priority', 'tasks_bulk_delete',
  'tasks_link', 'tasks_create_link', 'tasks_delete_link',
  'tasks_add_attachment', 'tasks_remove_attachment',
].sort();

const EPIC_READ = [
  'epics_get', 'epics_list', 'epics_search',
].sort();

const EPIC_MUTATION = [
  'epics_create', 'epics_update', 'epics_delete',
  'epics_link_task', 'epics_unlink_task',
].sort();

const SKILL_READ = [
  'skills_get', 'skills_list', 'skills_search', 'skills_find_linked', 'skills_recall',
].sort();

const SKILL_MUTATION = [
  'skills_create', 'skills_update', 'skills_delete',
  'skills_link', 'skills_create_link', 'skills_delete_link',
  'skills_add_attachment', 'skills_remove_attachment', 'skills_bump_usage',
].sort();

const ALL_TOOLS_COUNT = KNOWLEDGE_READ.length + KNOWLEDGE_MUTATION.length
  + TASK_READ.length + TASK_MUTATION.length
  + EPIC_READ.length + EPIC_MUTATION.length
  + SKILL_READ.length + SKILL_MUTATION.length
  + 1; // get_context

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MCP readonly graphs', () => {
  it('no restrictions — all tools visible', async () => {
    const names = await listToolNames();
    expect(names.length).toBe(ALL_TOOLS_COUNT);
    expect(names).toContain('get_context');
    for (const t of [...KNOWLEDGE_READ, ...KNOWLEDGE_MUTATION]) expect(names).toContain(t);
    for (const t of [...TASK_READ, ...TASK_MUTATION]) expect(names).toContain(t);
    for (const t of [...EPIC_READ, ...EPIC_MUTATION]) expect(names).toContain(t);
    for (const t of [...SKILL_READ, ...SKILL_MUTATION]) expect(names).toContain(t);
  });

  it('knowledge readonly — hides 7 knowledge mutation tools', async () => {
    const names = await listToolNames(new Set(['knowledge']));
    expect(names.length).toBe(ALL_TOOLS_COUNT - KNOWLEDGE_MUTATION.length); // 33
    for (const t of KNOWLEDGE_READ) expect(names).toContain(t);
    for (const t of KNOWLEDGE_MUTATION) expect(names).not.toContain(t);
  });

  it('tasks readonly — hides task + epic mutation tools', async () => {
    const names = await listToolNames(new Set(['tasks']));
    expect(names.length).toBe(ALL_TOOLS_COUNT - TASK_MUTATION.length - EPIC_MUTATION.length);
    for (const t of TASK_READ) expect(names).toContain(t);
    for (const t of TASK_MUTATION) expect(names).not.toContain(t);
    for (const t of EPIC_READ) expect(names).toContain(t);
    for (const t of EPIC_MUTATION) expect(names).not.toContain(t);
  });

  it('skills readonly — hides 9 skill mutation tools', async () => {
    const names = await listToolNames(new Set(['skills']));
    expect(names.length).toBe(ALL_TOOLS_COUNT - SKILL_MUTATION.length); // 31
    for (const t of SKILL_READ) expect(names).toContain(t);
    for (const t of SKILL_MUTATION) expect(names).not.toContain(t);
  });

  it('all three readonly — only read tools + get_context visible', async () => {
    const names = await listToolNames(new Set(['knowledge', 'tasks', 'skills']));
    const readCount = KNOWLEDGE_READ.length + TASK_READ.length + EPIC_READ.length + SKILL_READ.length + 1;
    expect(names.length).toBe(readCount);
    for (const t of KNOWLEDGE_READ) expect(names).toContain(t);
    for (const t of TASK_READ) expect(names).toContain(t);
    for (const t of EPIC_READ) expect(names).toContain(t);
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
    // Tasks, epics, and skills still visible
    for (const t of [...TASK_READ, ...TASK_MUTATION]) expect(names).toContain(t);
    for (const t of [...EPIC_READ, ...EPIC_MUTATION]) expect(names).toContain(t);
    for (const t of [...SKILL_READ, ...SKILL_MUTATION]) expect(names).toContain(t);
  });

  it('all graphs "r" — same as all readonly', async () => {
    const access = new Map<string, AccessLevel>([
      ['knowledge', 'r'],
      ['tasks', 'r'],
      ['skills', 'r'],
    ]);
    const names = await listToolNames(undefined, access);
    const readCount = KNOWLEDGE_READ.length + TASK_READ.length + EPIC_READ.length + SKILL_READ.length + 1;
    expect(names.length).toBe(readCount);
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

    // notes_search should still work (read tool) even on a readonly graph
    const result = await client.callTool({
      name: 'notes_search',
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
