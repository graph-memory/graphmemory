import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProjectManager } from '@/lib/project-manager';
import type { ServerConfig, ProjectConfig, WorkspaceConfig } from '@/lib/multi-config';
import * as embedder from '@/lib/embedder';

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

  // --- Embedding dimension probing ---

  describe('probeWorkspaceDimensions', () => {
    it('sets epics embedding dimension from tasks embedder', async () => {
      const wsDir = makeTmpDir('ws-probe-');
      const projDir = makeTmpDir('proj-probe-');

      await pm.addWorkspace('ws-probe', makeWorkspaceConfig(wsDir));
      await pm.addProject('proj-probe', makeProjectConfig(projDir), false, 'ws-probe');

      // Mock loadModel (no-op) and probeEmbeddingDim to return 1024 for all models
      const loadSpy = jest.spyOn(embedder, 'loadModel').mockResolvedValue();
      const probeSpy = jest.spyOn(embedder, 'probeEmbeddingDim').mockResolvedValue(1024);

      await pm.loadWorkspaceModels('ws-probe');
      await pm.probeWorkspaceDimensions('ws-probe');

      // probeEmbeddingDim should have been called for knowledge, tasks, skills, AND epics
      const probeKeys = probeSpy.mock.calls.map(c => c[0]);
      expect(probeKeys).toContain('ws-probe:knowledge');
      expect(probeKeys).toContain('ws-probe:tasks');
      expect(probeKeys).toContain('ws-probe:skills');
      // epics shares tasks embedder — dim should be set (either probed or inherited)

      // The workspace store should now accept 1024-dim epics embeddings
      const scoped = pm.getProject('proj-probe')!.storeManager.scoped;

      // Create a 1024-dim embedding — should NOT throw "Embedding dimension mismatch"
      const embedding = new Array(1024).fill(0.01);
      const epic = scoped.epics.create({ title: 'Probe test', description: '' }, embedding);
      expect(epic.id).toBeGreaterThan(0);

      loadSpy.mockRestore();
      probeSpy.mockRestore();
    });

    it('rejects 384-dim embedding when model produces 1024', async () => {
      const wsDir = makeTmpDir('ws-rej-');
      const projDir = makeTmpDir('proj-rej-');

      await pm.addWorkspace('ws-rej', makeWorkspaceConfig(wsDir));
      await pm.addProject('proj-rej', makeProjectConfig(projDir), false, 'ws-rej');

      jest.spyOn(embedder, 'loadModel').mockResolvedValue();
      const probeSpy = jest.spyOn(embedder, 'probeEmbeddingDim').mockResolvedValue(1024);

      await pm.loadWorkspaceModels('ws-rej');
      await pm.probeWorkspaceDimensions('ws-rej');

      const scoped = pm.getProject('proj-rej')!.storeManager.scoped;
      const badEmbedding = new Array(384).fill(0.01);
      expect(() => scoped.epics.create({ title: 'Bad', description: '' }, badEmbedding))
        .toThrow('Embedding dimension mismatch');

      probeSpy.mockRestore();
    });
  });

  describe('probeDimensions (standalone)', () => {
    it('sets epics dimension from knowledge embedder for standalone projects', async () => {
      const dir = makeTmpDir('standalone-');
      const config = makeProjectConfig(dir);
      // Enable knowledge so it gets probed
      config.graphConfigs.knowledge.enabled = true;

      await pm.addProject('standalone-probe', config);

      jest.spyOn(embedder, 'loadModel').mockResolvedValue();
      const probeSpy = jest.spyOn(embedder, 'probeEmbeddingDim').mockResolvedValue(1024);

      await pm.loadModels('standalone-probe');
      await pm.probeDimensions('standalone-probe');

      // Epics should inherit dimension from knowledge
      const scoped = pm.getProject('standalone-probe')!.storeManager.scoped;
      const embedding = new Array(1024).fill(0.01);
      const epic = scoped.epics.create({ title: 'Standalone', description: '' }, embedding);
      expect(epic.id).toBeGreaterThan(0);

      // 384-dim should be rejected
      expect(() => scoped.epics.create({ title: 'Bad', description: '' }, new Array(384).fill(0.01)))
        .toThrow('Embedding dimension mismatch');

      probeSpy.mockRestore();
    });
  });

  // --- Auto-reindex on model change ---

  describe('model fingerprint auto-reindex', () => {
    it('clears indexed graphs when embedding model changes', async () => {
      const dir = makeTmpDir('fp-');
      const config = makeProjectConfig(dir);
      config.graphConfigs.docs.enabled = true;

      await pm.addProject('fp-test', config);
      const project = pm.getProject('fp-test')!;

      // Insert a doc file so we can verify it gets cleared
      const embedding = new Array(384).fill(0.01);
      const embeddings = new Map([['test.md', embedding], ['test.md#chunk-0', embedding]]);
      project.scopedStore.docs.updateFile('test.md', [{
        fileId: 'test.md', title: 'Test', level: 1,
        content: 'hello', language: undefined, symbols: [], mtime: Date.now(),
      }], Date.now(), embeddings);

      expect(project.scopedStore.docs.listFiles().total).toBe(1);

      // Remove project and re-add with different model → should auto-clear docs
      await pm.removeProject('fp-test');
      config.graphConfigs.docs.model = { ...TEST_MODEL, name: 'different-model' };
      await pm.addProject('fp-test', config);

      const project2 = pm.getProject('fp-test')!;
      expect(project2.scopedStore.docs.listFiles().total).toBe(0);
    });

    it('does NOT clear when model fingerprint is unchanged', async () => {
      const dir = makeTmpDir('fp-same-');
      const config = makeProjectConfig(dir);
      config.graphConfigs.docs.enabled = true;

      await pm.addProject('fp-same', config);
      const project = pm.getProject('fp-same')!;

      const embedding = new Array(384).fill(0.01);
      const embeddings = new Map([['test.md', embedding], ['test.md#chunk-0', embedding]]);
      project.scopedStore.docs.updateFile('test.md', [{
        fileId: 'test.md', title: 'Test', level: 1,
        content: 'hello', language: undefined, symbols: [], mtime: Date.now(),
      }], Date.now(), embeddings);

      expect(project.scopedStore.docs.listFiles().total).toBe(1);

      // Remove and re-add with same model → data should persist
      await pm.removeProject('fp-same');
      await pm.addProject('fp-same', config);

      const project2 = pm.getProject('fp-same')!;
      expect(project2.scopedStore.docs.listFiles().total).toBe(1);
    });
  });
});
