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
    expect(p.graphConfigs.docs.include).toBe('**/*.md');
    expect(p.graphConfigs.code.include).toBe('**/*.{js,ts,jsx,tsx,mjs,mts,cjs,cts}');
    expect(p.exclude).toContain('**/node_modules/**');
    expect(p.chunkDepth).toBe(4);
    expect(p.embedding.maxChars).toBe(8000);
    expect(p.model.name).toBe('Xenova/bge-m3');
    // All graphs enabled by default
    for (const gn of ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'] as const) {
      expect(p.graphConfigs[gn].enabled).toBe(true);
    }
  });

  it('default codeInclude covers .mts/.cts/.mjs/.cjs extensions', () => {
    const yamlPath = tmpYaml(`
projects:
  my-app:
    projectDir: /tmp/my-app
`);
    const mc = loadMultiConfig(yamlPath);
    const pattern = mc.projects.get('my-app')!.graphConfigs.code.include!;
    const micromatch = require('micromatch');
    for (const ext of ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.mts', '.cjs', '.cts']) {
      expect(micromatch.isMatch(`src/file${ext}`, pattern)).toBe(true);
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
    expect(mc.server.model.name).toBe('Xenova/bge-m3');
    expect(mc.server.model.pooling).toBe('cls');
    expect(mc.server.model.queryPrefix).toBe('');
    expect(mc.server.model.documentPrefix).toBe('');
  });

  it('overrides server-level embedding', () => {
    const yamlPath = tmpYaml(`
server:
  host: "0.0.0.0"
  port: 8080
  sessionTimeout: 600
  model:
    name: custom/model
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
    expect(mc.server.model.name).toBe('custom/model');
    expect(mc.server.model.pooling).toBe('cls');
    expect(mc.server.model.queryPrefix).toBe('query: ');
    // Project inherits server model
    const p = mc.projects.get('a')!;
    expect(p.model.name).toBe('custom/model');
    expect(p.model.pooling).toBe('cls');
  });

  it('supports multiple projects with overrides', () => {
    const yamlPath = tmpYaml(`
server:
  model:
    name: default/model
projects:
  app1:
    projectDir: /tmp/app1
    model:
      name: custom/app1
    graphs:
      docs:
        include: "docs/**/*.md"
      code:
        enabled: false
  app2:
    projectDir: /tmp/app2
    graphMemory: ".my-graphs"
    chunkDepth: 6
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.projects.size).toBe(2);

    const app1 = mc.projects.get('app1')!;
    expect(app1.graphConfigs.docs.include).toBe('docs/**/*.md');
    expect(app1.graphConfigs.code.enabled).toBe(false);
    expect(app1.model.name).toBe('custom/app1');

    const app2 = mc.projects.get('app2')!;
    expect(app2.graphMemory).toBe('/tmp/app2/.my-graphs');
    expect(app2.chunkDepth).toBe(6);
    expect(app2.model.name).toBe('default/model');
  });

  it('per-graph model overrides (new format)', () => {
    const yamlPath = tmpYaml(`
server:
  model:
    name: default/model
    pooling: mean
projects:
  x:
    projectDir: /tmp/x
    graphs:
      docs:
        model:
          name: model/docs
          pooling: cls
      code:
        model:
          name: model/code
      knowledge:
        model:
          name: model/knowledge
          queryPrefix: "search: "
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    expect(x.graphConfigs.docs.model.name).toBe('model/docs');
    expect(x.graphConfigs.docs.model.pooling).toBe('cls');
    expect(x.graphConfigs.code.model.name).toBe('model/code');
    expect(x.graphConfigs.code.model.pooling).toBe('cls'); // from MODEL_DEFAULTS (whole object, no merge)
    expect(x.graphConfigs.knowledge.model.name).toBe('model/knowledge');
    expect(x.graphConfigs.knowledge.model.queryPrefix).toBe('search: ');
    // skills not overridden — inherits project model (which inherits server)
    expect(x.graphConfigs.skills.model.name).toBe('default/model');
    expect(x.graphConfigs.skills.model.pooling).toBe('mean');
  });

  it('graph-level model block takes precedence (first-defined-wins)', () => {
    const yamlPath = tmpYaml(`
projects:
  x:
    projectDir: /tmp/x
    model:
      name: proj/model
      pooling: cls
      queryPrefix: "proj-query: "
    graphs:
      docs:
        model:
          name: docs/model
          pooling: mean
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    // Full model block at graph level — no merge with project
    expect(x.graphConfigs.docs.model.name).toBe('docs/model');
    expect(x.graphConfigs.docs.model.pooling).toBe('mean');
    expect(x.graphConfigs.docs.model.queryPrefix).toBe(''); // NOT inherited from project
    // code still inherits from project
    expect(x.graphConfigs.code.model.name).toBe('proj/model');
  });

  it('graphs.*.enabled controls graph creation', () => {
    const yamlPath = tmpYaml(`
projects:
  x:
    projectDir: /tmp/x
    graphs:
      docs:
        enabled: true
        include: "content/**/*.md"
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
    expect(x.graphConfigs.docs.include).toBe('content/**/*.md');
    expect(x.graphConfigs.code.enabled).toBe(false);
    expect(x.graphConfigs.knowledge.enabled).toBe(false);
    expect(x.graphConfigs.tasks.enabled).toBe(true);
    expect(x.graphConfigs.skills.enabled).toBe(false);
    expect(x.graphConfigs.files.enabled).toBe(true);
  });

  it('graph-level exclude overrides project-level', () => {
    const yamlPath = tmpYaml(`
projects:
  x:
    projectDir: /tmp/x
    exclude:
      - "node_modules/**"
    graphs:
      docs:
        exclude:
          - "changelog/**"
      code:
        exclude:
          - "test/**"
          - "dist/**"
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    expect(x.exclude).toContain('node_modules/**');
    expect(x.graphConfigs.docs.exclude).toContain('changelog/**');
    expect(x.graphConfigs.code.exclude).toContain('test/**');
    expect(x.graphConfigs.code.exclude).toContain('dist/**');
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
    expect(ws.model.name).toBe('Xenova/bge-m3');
  });

  it('workspace inherits global model', () => {
    const yamlPath = tmpYaml(`
server:
  model:
    name: custom/model
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
    expect(ws.model.name).toBe('custom/model');
    expect(ws.model.pooling).toBe('cls');
  });

  it('workspace can override graph models', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
workspaces:
  ws:
    projects: [a]
    model:
      name: ws/model
    graphs:
      knowledge:
        model:
          name: model/k
          queryPrefix: "find: "
      tasks:
        model:
          name: model/t
      skills:
        model:
          name: model/s
`);
    const mc = loadMultiConfig(yamlPath);
    const ws = mc.workspaces.get('ws')!;
    expect(ws.graphConfigs.knowledge.model.name).toBe('model/k');
    expect(ws.graphConfigs.knowledge.model.queryPrefix).toBe('find: ');
    expect(ws.graphConfigs.tasks.model.name).toBe('model/t');
    expect(ws.graphConfigs.skills.model.name).toBe('model/s');
    // Whole object from graph level — pooling from MODEL_DEFAULTS, not ws model
    expect(ws.graphConfigs.tasks.model.pooling).toBe('cls');
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

  it('parses users and access config', () => {
    const yamlPath = tmpYaml(`
users:
  alice:
    name: "Alice"
    email: "alice@example.com"
    apiKey: "key-alice"
  bob:
    name: "Bob"
    email: "bob@example.com"
    apiKey: "key-bob"
server:
  defaultAccess: deny
  access:
    alice: rw
projects:
  a:
    projectDir: /tmp/a
    access:
      bob: r
    graphs:
      knowledge:
        access:
          bob: rw
workspaces:
  ws:
    projects: [a]
    access:
      bob: r
`);
    const mc = loadMultiConfig(yamlPath);
    // Users
    expect(Object.keys(mc.users)).toEqual(['alice', 'bob']);
    expect(mc.users.alice.name).toBe('Alice');
    expect(mc.users.alice.apiKey).toBe('key-alice');
    // Server
    expect(mc.server.defaultAccess).toBe('deny');
    expect(mc.server.access).toEqual({ alice: 'rw' });
    // Project
    const p = mc.projects.get('a')!;
    expect(p.access).toEqual({ bob: 'r' });
    // Graph
    expect(p.graphConfigs.knowledge.access).toEqual({ bob: 'rw' });
    expect(p.graphConfigs.docs.access).toBeUndefined();
    // Workspace
    const ws = mc.workspaces.get('ws')!;
    expect(ws.access).toEqual({ bob: 'r' });
  });

  it('defaults to rw when no access config', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.server.defaultAccess).toBe('rw');
    expect(mc.server.access).toBeUndefined();
    expect(mc.users).toEqual({});
  });

  it('parses embeddingApi config', () => {
    const yamlPath = tmpYaml(`
server:
  embeddingApi:
    enabled: true
    apiKey: "emb-secret-key"
projects:
  a:
    projectDir: /tmp/a
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.server.embeddingApi).toEqual({ enabled: true, apiKey: 'emb-secret-key', maxTexts: 100, maxTextChars: 10_000 });
  });

  it('defaults embeddingApi to undefined', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.server.embeddingApi).toBeUndefined();
  });

  it('parses remote embedding config', () => {
    const yamlPath = tmpYaml(`
server:
  model:
    name: "Xenova/bge-m3"
  embedding:
    remote: "http://gpu-server:3000/api/embed"
    remoteApiKey: "remote-key"
projects:
  a:
    projectDir: /tmp/a
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.server.embedding.remote).toBe('http://gpu-server:3000/api/embed');
    expect(mc.server.embedding.remoteApiKey).toBe('remote-key');
    // Project inherits remote config
    const p = mc.projects.get('a')!;
    expect(p.embedding.remote).toBe('http://gpu-server:3000/api/embed');
  });
});
