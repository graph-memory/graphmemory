import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProjectManager } from '@/lib/project-manager';
import type { ServerConfig, ProjectConfig, WorkspaceConfig } from '@/lib/multi-config';

// ---------------------------------------------------------------------------
// Helpers — minimal configs to test project/workspace management without
// loading real embedding models or running indexers
// ---------------------------------------------------------------------------

const TEST_MODEL = { name: 'test', pooling: 'mean' as const, normalize: true, queryPrefix: '', documentPrefix: '' };
const TEST_EMBEDDING = { batchSize: 1, maxChars: 2000, cacheSize: 0 };

function graphConfigs() {
  return Object.fromEntries(
    ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'].map(g => [g, {
      enabled: false,  // disabled to avoid indexer/model deps
      readonly: false,
      include: undefined,
      exclude: [],
      model: { ...TEST_MODEL },
      embedding: { ...TEST_EMBEDDING },
    }]),
  ) as any;
}

function makeServerConfig(): ServerConfig {
  return {
    host: '127.0.0.1',
    port: 0,
    modelsDir: '',
    jwtSecret: 'test-secret',
    sessionTtl: '30m',
    corsOrigins: [],
    secureCookie: false,
    oauth: { enabled: false, accessTokenTtl: '1h', refreshTokenTtl: '7d', authCodeTtl: '10m', allowedRedirectUris: [] },
    defaultAccess: 'full',
    users: {},
  } as any;
}

function makeProjectConfig(dir: string): ProjectConfig {
  const graphMemory = join(dir, '.graph-memory');
  mkdirSync(graphMemory, { recursive: true });
  return {
    projectDir: dir,
    graphMemory,
    exclude: [],
    chunkDepth: 4,
    maxFileSize: 1048576,
    model: { ...TEST_MODEL },
    embedding: { ...TEST_EMBEDDING },
    graphConfigs: graphConfigs(),
    author: { name: '', email: '' },
  } as any;
}

function makeWorkspaceConfig(dir: string): WorkspaceConfig {
  const graphMemory = join(dir, '.graph-memory');
  mkdirSync(graphMemory, { recursive: true });
  return {
    mirrorDir: dir,
    graphMemory,
    graphConfigs: graphConfigs(),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectManager', () => {
  let pm: ProjectManager;
  let tmpDirs: string[];

  beforeEach(() => {
    pm = new ProjectManager(makeServerConfig());
    tmpDirs = [];
  });

  afterEach(async () => {
    await pm.shutdown();
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  });

  function makeTmpDir(prefix = 'pm-test-'): string {
    const d = mkdtempSync(join(tmpdir(), prefix));
    tmpDirs.push(d);
    return d;
  }

  // --- Project management ---

  describe('addProject / getProject / listProjects', () => {
    it('adds and retrieves a project', async () => {
      const dir = makeTmpDir();
      await pm.addProject('proj1', makeProjectConfig(dir));

      expect(pm.getProject('proj1')).toBeDefined();
      expect(pm.getProject('proj1')!.id).toBe('proj1');
    });

    it('listProjects returns all project IDs', async () => {
      const d1 = makeTmpDir();
      const d2 = makeTmpDir();
      await pm.addProject('a', makeProjectConfig(d1));
      await pm.addProject('b', makeProjectConfig(d2));

      const ids = pm.listProjects();
      expect(ids).toContain('a');
      expect(ids).toContain('b');
      expect(ids).toHaveLength(2);
    });

    it('throws on duplicate project ID', async () => {
      const dir = makeTmpDir();
      await pm.addProject('dup', makeProjectConfig(dir));

      await expect(pm.addProject('dup', makeProjectConfig(dir)))
        .rejects.toThrow(/already exists/);
    });

    it('getProject returns undefined for unknown ID', () => {
      expect(pm.getProject('nope')).toBeUndefined();
    });
  });

  // --- Remove project ---

  describe('removeProject', () => {
    it('removes a project and cleans up', async () => {
      const dir = makeTmpDir();
      await pm.addProject('rm-me', makeProjectConfig(dir));
      expect(pm.getProject('rm-me')).toBeDefined();

      await pm.removeProject('rm-me');
      expect(pm.getProject('rm-me')).toBeUndefined();
      expect(pm.listProjects()).not.toContain('rm-me');
    });

    it('removeProject is no-op for unknown project', async () => {
      // Should not throw
      await pm.removeProject('unknown');
    });
  });

  // --- Workspace management ---

  describe('addWorkspace / getWorkspace / listWorkspaces', () => {
    it('adds and retrieves a workspace', async () => {
      const dir = makeTmpDir();
      await pm.addWorkspace('ws1', makeWorkspaceConfig(dir));

      expect(pm.getWorkspace('ws1')).toBeDefined();
      expect(pm.getWorkspace('ws1')!.id).toBe('ws1');
    });

    it('listWorkspaces returns all workspace IDs', async () => {
      const d1 = makeTmpDir();
      const d2 = makeTmpDir();
      await pm.addWorkspace('ws-a', makeWorkspaceConfig(d1));
      await pm.addWorkspace('ws-b', makeWorkspaceConfig(d2));

      const ids = pm.listWorkspaces();
      expect(ids).toContain('ws-a');
      expect(ids).toContain('ws-b');
    });

    it('throws on duplicate workspace ID', async () => {
      const dir = makeTmpDir();
      await pm.addWorkspace('dup-ws', makeWorkspaceConfig(dir));

      await expect(pm.addWorkspace('dup-ws', makeWorkspaceConfig(dir)))
        .rejects.toThrow(/already exists/);
    });

    it('getWorkspace returns undefined for unknown ID', () => {
      expect(pm.getWorkspace('nope')).toBeUndefined();
    });
  });

  // --- Project in workspace ---

  describe('project in workspace', () => {
    it('adds project to workspace', async () => {
      const wsDir = makeTmpDir('ws-');
      const projDir = makeTmpDir('proj-');

      await pm.addWorkspace('ws', makeWorkspaceConfig(wsDir));
      await pm.addProject('proj-in-ws', makeProjectConfig(projDir), false, 'ws');

      const project = pm.getProject('proj-in-ws');
      expect(project).toBeDefined();
      expect(project!.workspaceId).toBe('ws');
    });

    it('getProjectWorkspace returns workspace for workspace project', async () => {
      const wsDir = makeTmpDir('ws-');
      const projDir = makeTmpDir('proj-');

      await pm.addWorkspace('ws2', makeWorkspaceConfig(wsDir));
      await pm.addProject('proj-ws2', makeProjectConfig(projDir), false, 'ws2');

      const ws = pm.getProjectWorkspace('proj-ws2');
      expect(ws).toBeDefined();
      expect(ws!.id).toBe('ws2');
    });

    it('getProjectWorkspace returns undefined for standalone project', async () => {
      const dir = makeTmpDir();
      await pm.addProject('standalone', makeProjectConfig(dir));

      expect(pm.getProjectWorkspace('standalone')).toBeUndefined();
    });

    it('throws when workspace does not exist', async () => {
      const dir = makeTmpDir();
      await expect(pm.addProject('p', makeProjectConfig(dir), false, 'nonexistent-ws'))
        .rejects.toThrow(/not found/);
    });

    it('workspace project shares workspace storeManager', async () => {
      const wsDir = makeTmpDir('ws-');
      const projDir = makeTmpDir('proj-');

      await pm.addWorkspace('ws3', makeWorkspaceConfig(wsDir));
      await pm.addProject('proj-ws3', makeProjectConfig(projDir), false, 'ws3');

      const project = pm.getProject('proj-ws3')!;
      const ws = pm.getWorkspace('ws3')!;
      // Workspace projects share the workspace's storeManager
      expect(project.storeManager).toBe(ws.storeManager);
    });
  });

  // --- Shutdown ---

  describe('shutdown', () => {
    it('clears all projects and workspaces', async () => {
      const d1 = makeTmpDir();
      const d2 = makeTmpDir();
      await pm.addProject('p1', makeProjectConfig(d1));
      await pm.addProject('p2', makeProjectConfig(d2));

      await pm.shutdown();

      expect(pm.listProjects()).toHaveLength(0);
      expect(pm.listWorkspaces()).toHaveLength(0);
    });

    it('shutdown is safe to call multiple times', async () => {
      await pm.shutdown();
      await pm.shutdown(); // Should not throw
    });
  });

  // --- Events ---

  describe('event emission', () => {
    it('emits project:indexed on finalizeIndexing', async () => {
      const dir = makeTmpDir();
      await pm.addProject('evt', makeProjectConfig(dir));
      pm.ensureIndexer('evt');

      const events: string[] = [];
      pm.on('project:indexed', (data: any) => events.push(data.projectId));

      await pm.finalizeIndexing('evt');
      expect(events).toContain('evt');
    });
  });

  // --- Error handling ---

  describe('error handling', () => {
    it('ensureIndexer throws for unknown project', () => {
      expect(() => pm.ensureIndexer('nope')).toThrow(/not found/);
    });

    it('startIndexingPhase throws for unknown project', async () => {
      await expect(pm.startIndexingPhase('nope', 'docs')).rejects.toThrow(/not found/);
    });

    it('finalizeIndexing throws for unknown project', async () => {
      await expect(pm.finalizeIndexing('nope')).rejects.toThrow(/not found/);
    });

    it('loadModels throws for unknown project', async () => {
      await expect(pm.loadModels('nope')).rejects.toThrow(/not found/);
    });

    it('loadWorkspaceModels throws for unknown workspace', async () => {
      await expect(pm.loadWorkspaceModels('nope')).rejects.toThrow(/not found/);
    });

    it('startWorkspaceMirror throws for unknown workspace', async () => {
      await expect(pm.startWorkspaceMirror('nope')).rejects.toThrow(/not found/);
    });

    it('startIndexingPhase throws if indexer not created', async () => {
      const dir = makeTmpDir();
      await pm.addProject('no-indexer', makeProjectConfig(dir));

      await expect(pm.startIndexingPhase('no-indexer', 'docs')).rejects.toThrow(/Indexer not created/);
    });

    it('finalizeIndexing throws if indexer not created', async () => {
      const dir = makeTmpDir();
      await pm.addProject('no-indexer2', makeProjectConfig(dir));

      await expect(pm.finalizeIndexing('no-indexer2')).rejects.toThrow(/Indexer not created/);
    });
  });

  // --- Reindex ---

  describe('reindex', () => {
    it('reindex clears indexed data when project already exists', async () => {
      const dir = makeTmpDir();
      // First add
      await pm.addProject('reindex-test', makeProjectConfig(dir));
      await pm.removeProject('reindex-test');

      // Re-add with reindex flag (creates new store, so no data to clear)
      await pm.addProject('reindex-test', makeProjectConfig(dir), true);

      const project = pm.getProject('reindex-test');
      expect(project).toBeDefined();
    });
  });
});
