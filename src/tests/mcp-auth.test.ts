// Jest test for MCP auth configuration: readonly flag parsing,
// default values, and workspace-level readonly propagation.

import { loadMultiConfig } from '@/lib/multi-config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTempConfig(yaml: string): { yamlPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-auth-test-'));
  const yamlPath = path.join(dir, 'graph-memory.yaml');
  fs.writeFileSync(yamlPath, yaml, 'utf-8');
  // Create a dummy project dir so loadMultiConfig doesn't fail on missing dirs
  const projectDir = path.join(dir, 'my-project');
  fs.mkdirSync(projectDir, { recursive: true });
  return {
    yamlPath,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Tests — config parsing
// ---------------------------------------------------------------------------

describe('MCP auth config parsing', () => {
  it('readonly: true on a graph parses correctly', () => {
    const { yamlPath, cleanup } = writeTempConfig(`
projects:
  test:
    projectDir: ${path.join(os.tmpdir(), 'mcp-auth-test-placeholder', 'my-project')}
    graphs:
      knowledge:
        readonly: true
      tasks:
        readonly: true
`);
    // Fix the projectDir to match the temp dir
    const dir = path.dirname(yamlPath);
    const projectDir = path.join(dir, 'my-project');
    fs.writeFileSync(yamlPath, `
projects:
  test:
    projectDir: "${projectDir}"
    graphs:
      knowledge:
        readonly: true
      tasks:
        readonly: true
`, 'utf-8');

    try {
      const config = loadMultiConfig(yamlPath);
      const project = config.projects.get('test')!;
      expect(project).toBeDefined();
      expect(project.graphConfigs.knowledge.readonly).toBe(true);
      expect(project.graphConfigs.tasks.readonly).toBe(true);
      // Unspecified graphs default to false
      expect(project.graphConfigs.skills.readonly).toBe(false);
      expect(project.graphConfigs.docs.readonly).toBe(false);
      expect(project.graphConfigs.code.readonly).toBe(false);
      expect(project.graphConfigs.files.readonly).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('readonly defaults to false when not specified', () => {
    const { yamlPath, cleanup } = writeTempConfig('');
    const dir = path.dirname(yamlPath);
    const projectDir = path.join(dir, 'my-project');
    fs.writeFileSync(yamlPath, `
projects:
  test:
    projectDir: "${projectDir}"
`, 'utf-8');

    try {
      const config = loadMultiConfig(yamlPath);
      const project = config.projects.get('test')!;
      expect(project).toBeDefined();
      // All graphs should default readonly to false
      for (const gn of ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'] as const) {
        expect(project.graphConfigs[gn].readonly).toBe(false);
      }
    } finally {
      cleanup();
    }
  });

  it('workspace-level readonly parses correctly', () => {
    const { yamlPath, cleanup } = writeTempConfig('');
    const dir = path.dirname(yamlPath);
    const projectDir = path.join(dir, 'my-project');
    fs.writeFileSync(yamlPath, `
projects:
  test:
    projectDir: "${projectDir}"
workspaces:
  shared:
    projects:
      - test
    graphs:
      knowledge:
        readonly: true
      tasks:
        readonly: false
      skills:
        readonly: true
`, 'utf-8');

    try {
      const config = loadMultiConfig(yamlPath);
      const ws = config.workspaces.get('shared')!;
      expect(ws).toBeDefined();
      expect(ws.graphConfigs.knowledge.readonly).toBe(true);
      expect(ws.graphConfigs.tasks.readonly).toBe(false);
      expect(ws.graphConfigs.skills.readonly).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('per-graph access map parses correctly', () => {
    const { yamlPath, cleanup } = writeTempConfig('');
    const dir = path.dirname(yamlPath);
    const projectDir = path.join(dir, 'my-project');
    fs.writeFileSync(yamlPath, `
projects:
  test:
    projectDir: "${projectDir}"
    graphs:
      knowledge:
        access:
          alice: rw
          bob: r
          charlie: deny
`, 'utf-8');

    try {
      const config = loadMultiConfig(yamlPath);
      const project = config.projects.get('test')!;
      const access = project.graphConfigs.knowledge.access!;
      expect(access).toBeDefined();
      expect(access.alice).toBe('rw');
      expect(access.bob).toBe('r');
      expect(access.charlie).toBe('deny');
    } finally {
      cleanup();
    }
  });

  it('server defaultAccess defaults to rw', () => {
    const { yamlPath, cleanup } = writeTempConfig('');
    const dir = path.dirname(yamlPath);
    const projectDir = path.join(dir, 'my-project');
    fs.writeFileSync(yamlPath, `
projects:
  test:
    projectDir: "${projectDir}"
`, 'utf-8');

    try {
      const config = loadMultiConfig(yamlPath);
      expect(config.server.defaultAccess).toBe('rw');
    } finally {
      cleanup();
    }
  });

  it('users config with apiKey parses correctly', () => {
    const { yamlPath, cleanup } = writeTempConfig('');
    const dir = path.dirname(yamlPath);
    const projectDir = path.join(dir, 'my-project');
    fs.writeFileSync(yamlPath, `
users:
  alice:
    name: Alice
    email: alice@example.com
    apiKey: sk-test-key-12345
projects:
  test:
    projectDir: "${projectDir}"
`, 'utf-8');

    try {
      const config = loadMultiConfig(yamlPath);
      expect(config.users.alice).toBeDefined();
      expect(config.users.alice.name).toBe('Alice');
      expect(config.users.alice.email).toBe('alice@example.com');
      expect(config.users.alice.apiKey).toBe('sk-test-key-12345');
    } finally {
      cleanup();
    }
  });
});
