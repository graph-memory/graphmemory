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
    expect(p.embeddingModel).toBe('Xenova/all-MiniLM-L6-v2');
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
    expect(mc.server.embeddingModel).toBe('Xenova/all-MiniLM-L6-v2');
  });

  it('overrides server-level settings', () => {
    const yamlPath = tmpYaml(`
server:
  host: "0.0.0.0"
  port: 8080
  sessionTimeout: 600
  embeddingModel: custom/model
projects:
  a:
    projectDir: /tmp/a
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.server.host).toBe('0.0.0.0');
    expect(mc.server.port).toBe(8080);
    expect(mc.server.sessionTimeout).toBe(600);
    expect(mc.server.embeddingModel).toBe('custom/model');
    // Project inherits server embeddingModel
    expect(mc.projects.get('a')!.embeddingModel).toBe('custom/model');
  });

  it('supports multiple projects with overrides', () => {
    const yamlPath = tmpYaml(`
server:
  embeddingModel: default/model
projects:
  app1:
    projectDir: /tmp/app1
    docsPattern: "docs/**/*.md"
    codePattern: ""
    embeddingModel: custom/app1
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
    expect(app1.embeddingModel).toBe('custom/app1');

    const app2 = mc.projects.get('app2')!;
    expect(app2.graphMemory).toBe('/tmp/app2/.my-graphs');
    expect(app2.chunkDepth).toBe(6);
    expect(app2.embeddingModel).toBe('default/model');
  });

  it('supports per-graph model overrides', () => {
    const yamlPath = tmpYaml(`
projects:
  x:
    projectDir: /tmp/x
    docsModel: model/docs
    codeModel: model/code
    knowledgeModel: model/knowledge
    taskModel: model/tasks
    filesModel: model/files
`);
    const mc = loadMultiConfig(yamlPath);
    const x = mc.projects.get('x')!;
    expect(x.docsModel).toBe('model/docs');
    expect(x.codeModel).toBe('model/code');
    expect(x.knowledgeModel).toBe('model/knowledge');
    expect(x.taskModel).toBe('model/tasks');
    expect(x.filesModel).toBe('model/files');
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
    expect(ws.embeddingModel).toBe('Xenova/all-MiniLM-L6-v2');
  });

  it('workspace inherits global embeddingModel', () => {
    const yamlPath = tmpYaml(`
server:
  embeddingModel: custom/model
projects:
  a:
    projectDir: /tmp/a
workspaces:
  ws:
    projects: [a]
`);
    const mc = loadMultiConfig(yamlPath);
    expect(mc.workspaces.get('ws')!.embeddingModel).toBe('custom/model');
  });

  it('workspace can override embedding models', () => {
    const yamlPath = tmpYaml(`
projects:
  a:
    projectDir: /tmp/a
workspaces:
  ws:
    projects: [a]
    knowledgeModel: model/k
    taskModel: model/t
    skillsModel: model/s
`);
    const mc = loadMultiConfig(yamlPath);
    const ws = mc.workspaces.get('ws')!;
    expect(ws.knowledgeModel).toBe('model/k');
    expect(ws.taskModel).toBe('model/t');
    expect(ws.skillsModel).toBe('model/s');
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
