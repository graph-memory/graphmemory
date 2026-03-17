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
    expect(p.docsPattern).toBe('**/*.md');
    expect(p.codePattern).toBe('**/*.{js,ts,jsx,tsx}');
    expect(p.excludePattern).toBe('node_modules/**');
    expect(p.chunkDepth).toBe(4);
    expect(p.maxTokensDefault).toBe(4000);
    expect(p.embedMaxChars).toBe(2000);
    expect(p.embedding.model).toBe('Xenova/bge-m3');
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
    expect(mc.server.embedding.pooling).toBe('mean');
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
    expect(app1.docsPattern).toBe('docs/**/*.md');
    expect(app1.codePattern).toBe('');
    expect(app1.embedding.model).toBe('custom/app1');

    const app2 = mc.projects.get('app2')!;
    expect(app2.graphMemory).toBe('/tmp/app2/.my-graphs');
    expect(app2.chunkDepth).toBe(6);
    expect(app2.embedding.model).toBe('default/model');
  });

  it('supports per-graph embedding overrides', () => {
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
    expect(x.graphEmbeddings.docs.model).toBe('model/docs');
    expect(x.graphEmbeddings.docs.pooling).toBe('cls');
    expect(x.graphEmbeddings.code.model).toBe('model/code');
    expect(x.graphEmbeddings.code.pooling).toBe('mean'); // inherited from project
    expect(x.graphEmbeddings.knowledge.model).toBe('model/knowledge');
    expect(x.graphEmbeddings.knowledge.queryPrefix).toBe('search: ');
    expect(x.graphEmbeddings.tasks.model).toBe('model/tasks');
    expect(x.graphEmbeddings.files.model).toBe('model/files');
    // skills not overridden — inherits project default
    expect(x.graphEmbeddings.skills.model).toBe('default/model');
  });

  it('graph overrides inherit from project embedding', () => {
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
    // docs overrides model but inherits pooling/prefix from project
    expect(x.graphEmbeddings.docs.model).toBe('docs/model');
    expect(x.graphEmbeddings.docs.pooling).toBe('cls');
    expect(x.graphEmbeddings.docs.queryPrefix).toBe('proj-query: ');
    // code inherits everything from project
    expect(x.graphEmbeddings.code.model).toBe('proj/model');
    expect(x.graphEmbeddings.code.pooling).toBe('cls');
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
    expect(ws.graphEmbeddings.knowledge.model).toBe('model/k');
    expect(ws.graphEmbeddings.knowledge.queryPrefix).toBe('find: ');
    expect(ws.graphEmbeddings.tasks.model).toBe('model/t');
    expect(ws.graphEmbeddings.skills.model).toBe('model/s');
    // Inherited fields from workspace embedding
    expect(ws.graphEmbeddings.tasks.pooling).toBe('mean');
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
