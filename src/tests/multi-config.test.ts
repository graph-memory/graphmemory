import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadMultiConfig } from '@/lib/multi-config';

function tmpYaml(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-test-'));
  const yamlPath = path.join(dir, 'graph-memory.yaml');
  fs.writeFileSync(yamlPath, content, 'utf-8');
  return yamlPath;
}

describe('loadMultiConfig', () => {
  it('parses a minimal config with one project', () => {
    const yamlPath = tmpYaml(`
projects:
  my-app:
    projectDir: /tmp/my-app
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.projects.size).toBe(1);
    const p = mc.projects.get('my-app')!;
    expect(p.projectDir).toBe('/tmp/my-app');
    expect(p.graphMemory).toBe('/tmp/my-app/.graph-memory');
    expect(p.graphConfigs.docs.pattern).toBe('**/*.md');
    expect(p.graphConfigs.code.pattern).toBe('**/*.{js,ts,jsx,tsx}');
    expect(p.excludePattern).toBe('node_modules/**');
    expect(p.chunkDepth).toBe(4);
    expect(p.maxTokensDefault).toBe(4000);
    expect(p.embedMaxChars).toBe(2000);
    expect(p.embedding.model).toBe('Xenova/bge-m3');
    // All graphs enabled by default
    for (const gn of ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'] as const) {
      expect(p.graphConfigs[gn].enabled).toBe(true);
    }
  });

  it('applies server-level defaults', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.server.host).toBe('127.0.0.1');
    expect(mc.server.port).toBe(3000);
    expect(mc.server.sessionTimeout).toBe(1800);
    expect(mc.server.embedding.model).toBe('Xenova/bge-m3');
    expect(mc.server.embedding.pooling).toBe('cls');
    expect(mc.server.embedding.queryPrefix).toBe('');
    expect(mc.server.embedding.documentPrefix).toBe('');
  });

  it('overrides server-level embedding', () => {
    const yamlPath = tmpYaml(`
server:
  host: "0.0.0.0"
  port: 8080
  sessionTimeout: 600
  embedding:
    model: custom/model
    pooling: cls
    queryPrefix: "query: "
projects:
  a:
    projectDir: /tmp/a
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.server.host).toBe('0.0.0.0');
    expect(mc.server.port).toBe(8080);
    expect(mc.server.sessionTimeout).toBe(600);
    expect(mc.server.embedding.model).toBe('custom/model');
    expect(mc.server.embedding.pooling).toBe('cls');
    expect(mc.server.embedding.queryPrefix).toBe('query: ');
    // Project inherits server embedding
    const p = mc.projects.get('a')!;
    expect(p.embedding.model).toBe('custom/model');
    expect(p.embedding.pooling).toBe('cls');
  });

  it('supports multiple projects with overrides', () => {
    const yamlPath = tmpYaml(`
server:
  embedding:
    model: default/model
projects:
  app1:
    projectDir: /tmp/app1
    docsPattern: "docs/**/*.md"
    codePattern: ""
    embedding:
      model: custom/app1
  app2:
    projectDir: /tmp/app2
    graphMemory: ".my-graphs"
    chunkDepth: 6
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.projects.size).toBe(2);

    const app1 = mc.projects.get('app1')!;
    // Legacy docsPattern migrated to graphs.docs.pattern
    expect(app1.graphConfigs.docs.pattern).toBe('docs/**/*.md');
    // Legacy codePattern: "" migrated to graphs.code.enabled: false
    expect(app1.graphConfigs.code.enabled).toBe(false);
    expect(app1.embedding.model).toBe('custom/app1');

    const app2 = mc.projects.get('app2')!;
    expect(app2.graphMemory).toBe('/tmp/app2/.my-graphs');
    expect(app2.chunkDepth).toBe(6);
    expect(app2.embedding.model).toBe('default/model');
  });

  it('supports per-graph embedding overrides (legacy flat fields)', () => {
    const yamlPath = tmpYaml(`
server:
  embedding:
    model: default/model
    pooling: mean
projects:
  x:
    projectDir: /tmp/x
    graphs:
      docs:
        model: model/docs
        pooling: cls
      code:
        model: model/code
      knowledge:
        model: model/knowledge
        queryPrefix: "search: "
      tasks:
        model: model/tasks
      files:
        model: model/files
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    // Legacy flat fields: model, pooling etc. at graph level → merged with project embedding
    expect(x.graphConfigs.docs.embedding.model).toBe('model/docs');
    expect(x.graphConfigs.docs.embedding.pooling).toBe('cls');
    expect(x.graphConfigs.code.embedding.model).toBe('model/code');
    expect(x.graphConfigs.code.embedding.pooling).toBe('mean'); // inherited from project
    expect(x.graphConfigs.knowledge.embedding.model).toBe('model/knowledge');
    expect(x.graphConfigs.knowledge.embedding.queryPrefix).toBe('search: ');
    expect(x.graphConfigs.tasks.embedding.model).toBe('model/tasks');
    expect(x.graphConfigs.files.embedding.model).toBe('model/files');
    // skills not overridden — inherits project default
    expect(x.graphConfigs.skills.embedding.model).toBe('default/model');
  });

  it('legacy graph overrides inherit from project embedding', () => {
    const yamlPath = tmpYaml(`
projects:
  x:
    projectDir: /tmp/x
    embedding:
      model: proj/model
      pooling: cls
      queryPrefix: "proj-query: "
    graphs:
      docs:
        model: docs/model
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    // Legacy flat model field: merged with project embedding
    expect(x.graphConfigs.docs.embedding.model).toBe('docs/model');
    expect(x.graphConfigs.docs.embedding.pooling).toBe('cls');
    expect(x.graphConfigs.docs.embedding.queryPrefix).toBe('proj-query: ');
    // code inherits everything from project
    expect(x.graphConfigs.code.embedding.model).toBe('proj/model');
    expect(x.graphConfigs.code.embedding.pooling).toBe('cls');
  });

  it('graph-level embedding block takes precedence (first-defined-wins)', () => {
    const yamlPath = tmpYaml(`
projects:
  x:
    projectDir: /tmp/x
    embedding:
      model: proj/model
      pooling: cls
      queryPrefix: "proj-query: "
    graphs:
      docs:
        embedding:
          model: docs/model
          pooling: mean
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    // Full embedding block at graph level — no merge with project
    expect(x.graphConfigs.docs.embedding.model).toBe('docs/model');
    expect(x.graphConfigs.docs.embedding.pooling).toBe('mean');
    expect(x.graphConfigs.docs.embedding.queryPrefix).toBe(''); // NOT inherited from project
    // code still inherits from project
    expect(x.graphConfigs.code.embedding.model).toBe('proj/model');
  });

  it('graphs.*.enabled controls graph creation', () => {
    const yamlPath = tmpYaml(`
projects:
  x:
    projectDir: /tmp/x
    graphs:
      docs:
        enabled: true
        pattern: "content/**/*.md"
      code:
        enabled: false
      knowledge:
        enabled: false
      tasks:
        enabled: true
      skills:
        enabled: false
      files:
        enabled: true
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    expect(x.graphConfigs.docs.enabled).toBe(true);
    expect(x.graphConfigs.docs.pattern).toBe('content/**/*.md');
    expect(x.graphConfigs.code.enabled).toBe(false);
    expect(x.graphConfigs.knowledge.enabled).toBe(false);
    expect(x.graphConfigs.tasks.enabled).toBe(true);
    expect(x.graphConfigs.skills.enabled).toBe(false);
    expect(x.graphConfigs.files.enabled).toBe(true);
  });

  it('graph-level excludePattern overrides project-level', () => {
    const yamlPath = tmpYaml(`
projects:
  x:
    projectDir: /tmp/x
    excludePattern: "node_modules/**"
    graphs:
      docs:
        excludePattern: "changelog/**"
      code:
        excludePattern: "test/**,dist/**"
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    expect(x.excludePattern).toBe('node_modules/**');
    expect(x.graphConfigs.docs.excludePattern).toBe('changelog/**');
    expect(x.graphConfigs.code.excludePattern).toBe('test/**,dist/**');
    // files has no graph-level exclude — undefined (caller uses project-level fallback)
    expect(x.graphConfigs.files.excludePattern).toBeUndefined();
  });

  it('throws on invalid YAML (missing projects)', () => {
    const yamlPath = tmpYaml(`
server:
  port: 3000
`);
    expect(() => loadMultiConfig(yamlPath)).toThrow();
  });

  it('throws on invalid project (missing projectDir)', () => {
    const yamlPath = tmpYaml(`
projects:
  bad:
    docsPattern: "**/*.md"
`);
    expect(() => loadMultiConfig(yamlPath)).toThrow();
  });

  it('returns empty workspaces map when no workspaces defined', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.workspaces.size).toBe(0);
  });

  it('parses a workspace with project references', () => {
    const yamlPath = tmpYaml(`
projects:
  frontend:
    projectDir: /tmp/frontend
  backend:
    projectDir: /tmp/backend
workspaces:
  my-ws:
    projects: [frontend, backend]
    graphMemory: /tmp/shared/.graph-memory
    mirrorDir: /tmp/shared/mirror
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.workspaces.size).toBe(1);
    const ws = mc.workspaces.get('my-ws')!;
    expect(ws.projects).toEqual(['frontend', 'backend']);
    expect(ws.graphMemory).toBe('/tmp/shared/.graph-memory');
    expect(ws.mirrorDir).toBe('/tmp/shared/mirror');
    expect(ws.embedding.model).toBe('Xenova/bge-m3');
  });

  it('workspace inherits global embedding', () => {
    const yamlPath = tmpYaml(`
server:
  embedding:
    model: custom/model
    pooling: cls
projects:
  a:
    projectDir: /tmp/a
workspaces:
  ws:
    projects: [a]
`);
    const mc = loadMultiConfig(yamlPath);
    const ws = mc.workspaces.get('ws')!;
    expect(ws.embedding.model).toBe('custom/model');
    expect(ws.embedding.pooling).toBe('cls');
  });

  it('workspace can override graph embeddings', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
workspaces:
  ws:
    projects: [a]
    embedding:
      model: ws/model
    graphs:
      knowledge:
        model: model/k
        queryPrefix: "find: "
      tasks:
        model: model/t
      skills:
        model: model/s
`);
    const mc = loadMultiConfig(yamlPath);
    const ws = mc.workspaces.get('ws')!;
    expect(ws.graphConfigs.knowledge.embedding.model).toBe('model/k');
    expect(ws.graphConfigs.knowledge.embedding.queryPrefix).toBe('find: ');
    expect(ws.graphConfigs.tasks.embedding.model).toBe('model/t');
    expect(ws.graphConfigs.skills.embedding.model).toBe('model/s');
    // Inherited fields from workspace embedding (legacy merge)
    expect(ws.graphConfigs.tasks.embedding.pooling).toBe('cls');
  });

  it('throws when workspace references unknown project', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
workspaces:
  ws:
    projects: [a, nonexistent]
`);
    expect(() => loadMultiConfig(yamlPath)).toThrow('unknown project "nonexistent"');
  });

  it('workspace defaults graphMemory to first project dir', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
  b:
    projectDir: /tmp/b
workspaces:
  ws:
    projects: [a, b]
`);
    const mc = loadMultiConfig(yamlPath);
    const ws = mc.workspaces.get('ws')!;
    expect(ws.graphMemory).toBe('/tmp/a/.graph-memory/workspace');
    expect(ws.mirrorDir).toBe(ws.graphMemory);
  });
});
