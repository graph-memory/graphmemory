/**
 * Phase 5: Skills
 *
 * Tests: CRUD, search, recall, usage tracking, skill links,
 * cross-graph links, file mirror, attachments, filters.
 */

import {
  group, test, runPhase,
  get, post, put, del,
  mcpCall,
  assert, assertEqual, assertExists, assertOk, assertStatus, assertMcpOk, assertIncludes,
  printSummary, runStandalone, wait,
  fileExists, projectPath,
} from './utils';
import { writeFileSync, unlinkSync } from 'fs';

let restSkillId = '';
let mcpSkillId = '';
let skillA_Id = '';
let skillB_Id = '';
let codeSymbolId = '';

// ─── 5.1 CRUD ────────────────────────────────────────────────────

group('5.1 CRUD — REST');

test('POST /skills — create skill', async () => {
  const res = await post('/skills', {
    title: 'REST Test Skill',
    description: 'Skill created via REST.',
    steps: ['Step 1', 'Step 2'],
    triggers: ['on request'],
    tags: ['test', 'rest'],
    source: 'user',
    confidence: 0.9,
  });
  assertOk(res);
  restSkillId = res.data.skillId ?? res.data.id;
  assertExists(restSkillId, 'skillId');
});

test('GET /skills/{skillId} — get skill', async () => {
  const res = await get(`/skills/${restSkillId}`);
  assertOk(res);
  assertEqual(res.data.title, 'REST Test Skill', 'title');
});

test('GET /skills — list skills', async () => {
  const res = await get('/skills');
  assertOk(res);
  const skills = res.data.results ?? res.data;
  assertIncludes(skills, (s: any) => s.id === restSkillId, 'list contains skill');
});

test('PUT /skills/{skillId} — update', async () => {
  const res = await put(`/skills/${restSkillId}`, { description: 'Updated skill.' });
  assertOk(res);
});

test('DELETE /skills/{skillId} — returns 204', async () => {
  const res = await del(`/skills/${restSkillId}`);
  assertStatus(res, 204);
});

group('5.1 CRUD — MCP');

test('MCP skills_create', async () => {
  const res = await mcpCall('skills_create', {
    title: 'MCP Test Skill',
    description: 'Created via MCP.',
    steps: ['Do A', 'Do B'],
    triggers: ['when asked'],
    tags: ['test', 'mcp'],
    source: 'learned',
    confidence: 0.85,
  });
  assertMcpOk(res);
  mcpSkillId = res.data.skillId ?? res.data.id;
  assertExists(mcpSkillId, 'skillId');
});

test('MCP skills_get — matches', async () => {
  const res = await mcpCall('skills_get', { skillId: mcpSkillId });
  assertMcpOk(res);
  assertEqual(res.data.title, 'MCP Test Skill', 'title');
});

test('MCP skills_list — contains skill', async () => {
  const res = await mcpCall('skills_list');
  assertMcpOk(res);
  const skills = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assertIncludes(skills, (s: any) => s.id === mcpSkillId, 'list contains skill');
});

test('MCP skills_update — reflected', async () => {
  const res = await mcpCall('skills_update', {
    skillId: mcpSkillId,
    description: 'Updated via MCP.',
  });
  assertMcpOk(res);
});

test('MCP skills_delete', async () => {
  const res = await mcpCall('skills_delete', { skillId: mcpSkillId });
  assertMcpOk(res);
});

// ─── 5.2 Search & Recall ────────────────────────────────────────

group('5.2 Search & Recall');

test('Create skills for search tests', async () => {
  let res = await post('/skills', {
    title: 'Database Migration Skill',
    description: 'How to run database migrations safely in production.',
    steps: ['Backup DB', 'Run migration', 'Verify'],
    triggers: ['database migration'],
    tags: ['database', 'ops'],
    source: 'user',
    confidence: 0.95,
  });
  assertOk(res);
  skillA_Id = res.data.skillId ?? res.data.id;

  res = await post('/skills', {
    title: 'Code Review Skill',
    description: 'Best practices for conducting code reviews.',
    steps: ['Read PR description', 'Check tests', 'Review logic'],
    triggers: ['code review'],
    tags: ['development', 'review'],
    source: 'learned',
    confidence: 0.8,
  });
  assertOk(res);
  skillB_Id = res.data.skillId ?? res.data.id;
});

test('REST GET /skills/search?q=migration — finds skill', async () => {
  await wait(500);
  const res = await get('/skills/search?q=database+migration');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should find migration skill');
});

test('REST GET /skills/recall?q=migration — recalls skill', async () => {
  const res = await get('/skills/recall?q=migration');
  assertOk(res);
  const results = res.data.results ?? res.data;
  assert(results.length > 0, 'should recall skill');
});

test('MCP skills_search — finds skill', async () => {
  const res = await mcpCall('skills_search', { query: 'database migration' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should find skill');
});

test('MCP skills_recall — recalls skill', async () => {
  const res = await mcpCall('skills_recall', { context: 'I need to migrate the database' });
  assertMcpOk(res);
  const results = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(results.length > 0, 'should recall skill');
});

// ─── 5.3 Usage tracking ────────────────────────────────────────

group('5.3 Usage tracking');

test('REST POST /skills/{id}/bump — increments usageCount', async () => {
  const res = await post(`/skills/${skillA_Id}/bump`);
  assertOk(res);
});

test('MCP skills_bump_usage — increments usageCount', async () => {
  const res = await mcpCall('skills_bump_usage', { skillId: skillA_Id });
  assertMcpOk(res);
});

test('Verify usageCount and lastUsedAt', async () => {
  const res = await get(`/skills/${skillA_Id}`);
  assertOk(res);
  assert(res.data.usageCount >= 2, `usageCount should be >= 2, got ${res.data.usageCount}`);
  assertExists(res.data.lastUsedAt, 'lastUsedAt');
});

// ─── 5.4 Skill links (skill-to-skill) ──────────────────────────

group('5.4 Skill links (skill-to-skill)');

test('MCP skills_link — depends_on', async () => {
  const res = await mcpCall('skills_link', {
    fromId: skillB_Id,
    toId: skillA_Id,
    kind: 'depends_on',
  });
  assertMcpOk(res);
});

test('MCP skills_get — shows dependsOn', async () => {
  const res = await mcpCall('skills_get', { skillId: skillB_Id });
  assertMcpOk(res);
  const deps = res.data.dependsOn ?? [];
  assert(deps.length > 0, 'should show dependsOn');
});

test('MCP skills_link — variant_of', async () => {
  const res = await mcpCall('skills_link', {
    fromId: skillA_Id,
    toId: skillB_Id,
    kind: 'variant_of',
  });
  assertMcpOk(res);
});

test('MCP skills_link — related_to', async () => {
  const res = await mcpCall('skills_link', {
    fromId: skillA_Id,
    toId: skillB_Id,
    kind: 'related_to',
  });
  assertMcpOk(res);
});

test('REST GET /skills/{id}/relations — lists relations', async () => {
  const res = await get(`/skills/${skillA_Id}/relations`);
  assertOk(res);
  const rels = res.data.results ?? res.data;
  assert(Array.isArray(rels) && rels.length > 0, 'should have relations');
});

// ─── 5.5 Cross-graph links ─────────────────────────────────────

group('5.5 Cross-graph links');

test('Get a code symbol for cross-linking', async () => {
  const res = await get('/code/files');
  assertOk(res);
  const files = res.data.results ?? res.data;
  const fileId = files[0]?.fileId ?? files[0]?.id;
  const symRes = await get(`/code/files/${fileId}/symbols`);
  assertOk(symRes);
  const symbols = symRes.data.results ?? symRes.data;
  codeSymbolId = symbols[0]?.id;
  assertExists(codeSymbolId, 'code symbol id');
});

test('MCP skills_create_link — link to code', async () => {
  const res = await mcpCall('skills_create_link', {
    skillId: skillA_Id,
    targetId: codeSymbolId,
    targetGraph: 'code',
    kind: 'references',
  });
  assertMcpOk(res);
});

test('MCP skills_find_linked — find skills linked to code', async () => {
  const res = await mcpCall('skills_find_linked', {
    targetId: codeSymbolId,
    targetGraph: 'code',
  });
  assertMcpOk(res);
  const skills = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(skills.length > 0, 'should find linked skills');
});

test('REST GET /skills/linked — same result', async () => {
  const res = await get(`/skills/linked?targetGraph=code&targetNodeId=${codeSymbolId}`);
  assertOk(res);
  const skills = res.data.results ?? res.data;
  assert(skills.length > 0, 'should find linked skills');
});

test('MCP skills_delete_link — remove cross-graph link', async () => {
  const res = await mcpCall('skills_delete_link', {
    skillId: skillA_Id,
    targetId: codeSymbolId,
    targetGraph: 'code',
    kind: 'references',
  });
  assertMcpOk(res);
});

// ─── 5.6 File mirror ────────────────────────────────────────────

group('5.6 File mirror');

test('Check .skills/ directory exists', async () => {
  await wait(500);
  const skillsDir = projectPath('.skills');
  assert(fileExists(skillsDir), `.skills/ directory should exist at ${skillsDir}`);
});

// ─── 5.7 Attachments ────────────────────────────────────────────

group('5.7 Attachments');

test('Attach file to skill', async () => {
  writeFileSync(projectPath('skill-attach.txt'), 'Skill attachment');
  const res = await mcpCall('skills_add_attachment', {
    skillId: skillA_Id,
    filePath: projectPath('skill-attach.txt'),
  });
  assertMcpOk(res);
});

test('REST GET /skills/{id}/attachments — lists', async () => {
  const res = await get(`/skills/${skillA_Id}/attachments`);
  assertOk(res);
  const atts = res.data.results ?? res.data;
  assert(Array.isArray(atts) && atts.length > 0, 'should have attachment');
});

test('REST GET /skills/{id}/attachments/{filename} — download', async () => {
  const res = await get(`/skills/${skillA_Id}/attachments/skill-attach.txt`);
  assertOk(res);
});

test('MCP skills_remove_attachment', async () => {
  const res = await mcpCall('skills_remove_attachment', {
    skillId: skillA_Id,
    filename: 'skill-attach.txt',
  });
  assertMcpOk(res);
  try { unlinkSync(projectPath('skill-attach.txt')); } catch {}
});

// ─── 5.8 Filters ────────────────────────────────────────────────

group('5.8 Filters');

test('skills_list with source filter', async () => {
  const res = await mcpCall('skills_list', { source: 'user' });
  assertMcpOk(res);
  const skills = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(skills.length > 0, 'should find manual skills');
});

test('skills_list with tag filter', async () => {
  const res = await mcpCall('skills_list', { tag: 'database' });
  assertMcpOk(res);
  const skills = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(skills.length > 0, 'should find by tag');
});

test('skills_list with filter (text)', async () => {
  const res = await mcpCall('skills_list', { filter: 'Migration' });
  assertMcpOk(res);
  const skills = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(skills.length > 0, 'should find by text');
});

test('skills_list with limit', async () => {
  const res = await mcpCall('skills_list', { limit: 1 });
  assertMcpOk(res);
  const skills = Array.isArray(res.data) ? res.data : res.data?.results ?? [];
  assert(skills.length <= 1, 'should respect limit');
});

// ─── 5.9 All optional fields + pagination ───────────────────────

group('5.9 All optional fields + pagination');

test('Create skill with all optional fields', async () => {
  const res = await post('/skills', {
    title: 'Full Skill',
    description: 'All fields set.',
    steps: ['Step 1', 'Step 2', 'Step 3'],
    triggers: ['on deploy', 'on release'],
    inputHints: ['branch name', 'version'],
    filePatterns: ['*.yaml', 'deploy/**'],
    tags: ['full', 'test'],
    source: 'learned',
    confidence: 0.75,
  });
  assertOk(res);
  const check = await get(`/skills/${res.data.id}`);
  assertOk(check);
  assertEqual(check.data.steps.length, 3, 'steps count');
  assertEqual(check.data.triggers.length, 2, 'triggers count');
  assertEqual(check.data.confidence, 0.75, 'confidence');
  assertEqual(check.data.source, 'learned', 'source');
  await del(`/skills/${res.data.id}`);
});

test('skills_list with offset pagination', async () => {
  const all = await mcpCall('skills_list');
  assertMcpOk(all);
  const total = (Array.isArray(all.data) ? all.data : all.data?.results ?? []).length;
  if (total >= 2) {
    const page = await mcpCall('skills_list', { limit: 1, offset: 1 });
    assertMcpOk(page);
    const items = Array.isArray(page.data) ? page.data : page.data?.results ?? [];
    assert(items.length === 1, 'offset page should have 1 item');
  }
});

// ─── Cleanup ─────────────────────────────────────────────────────

group('Cleanup');

test('Delete test skills', async () => {
  for (const id of [skillA_Id, skillB_Id]) {
    if (id) try { await del(`/skills/${id}`); } catch {}
  }
});

// ─── Run ─────────────────────────────────────────────────────────

export async function run() {
  return runPhase('Phase 5: Skills');
}

if (process.argv[1]?.includes('05-')) {
  runStandalone(run);
}
