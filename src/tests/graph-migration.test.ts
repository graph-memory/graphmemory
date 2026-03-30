import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadKnowledgeGraph, saveKnowledgeGraph, createKnowledgeGraph } from '@/graphs/knowledge';
import { loadTaskGraph, saveTaskGraph, createTaskGraph } from '@/graphs/task';
import { loadSkillGraph, saveSkillGraph, createSkillGraph } from '@/graphs/skill';
import { GRAPH_DATA_VERSION } from '@/lib/defaults';

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-migration-'));
  return dir;
}

describe('Graph migration — preserves user data on version/embedding change', () => {
  describe('Knowledge graph', () => {
    it('preserves notes when data version changes', () => {
      const dir = tmpDir();

      // Create and save a graph with a note
      const graph = createKnowledgeGraph();
      graph.addNode('test-note', {
        title: 'My Note', content: 'Important data', tags: ['keep'],
        embedding: [1, 2, 3], createdAt: 1000, updatedAt: 2000, version: 1,
        attachments: [],
      });
      saveKnowledgeGraph(graph, dir, 'model-v1');

      // Tamper version in saved file to simulate old version
      const file = path.join(dir, 'knowledge.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      data.version = GRAPH_DATA_VERSION - 1;
      fs.writeFileSync(file, JSON.stringify(data));

      // Load — should preserve data but clear embeddings
      const loaded = loadKnowledgeGraph(dir, false, 'model-v1');
      expect(loaded.hasNode('test-note')).toBe(true);
      expect(loaded.getNodeAttribute('test-note', 'title')).toBe('My Note');
      expect(loaded.getNodeAttribute('test-note', 'content')).toBe('Important data');
      expect(loaded.getNodeAttribute('test-note', 'embedding')).toEqual([]);
    });

    it('preserves notes when embedding model changes', () => {
      const dir = tmpDir();

      const graph = createKnowledgeGraph();
      graph.addNode('note-2', {
        title: 'Note 2', content: 'Data', tags: [],
        embedding: [4, 5, 6], createdAt: 1000, updatedAt: 2000, version: 1,
        attachments: [],
      });
      saveKnowledgeGraph(graph, dir, 'old-model');

      // Load with different embedding fingerprint
      const loaded = loadKnowledgeGraph(dir, false, 'new-model');
      expect(loaded.hasNode('note-2')).toBe(true);
      expect(loaded.getNodeAttribute('note-2', 'title')).toBe('Note 2');
      expect(loaded.getNodeAttribute('note-2', 'embedding')).toEqual([]);
    });

    it('keeps embeddings when nothing changed', () => {
      const dir = tmpDir();

      const graph = createKnowledgeGraph();
      graph.addNode('note-3', {
        title: 'Note 3', content: 'Data', tags: [],
        embedding: [7, 8, 9], createdAt: 1000, updatedAt: 2000, version: 1,
        attachments: [],
      });
      saveKnowledgeGraph(graph, dir, 'same-model');

      const loaded = loadKnowledgeGraph(dir, false, 'same-model');
      expect(loaded.getNodeAttribute('note-3', 'embedding')).toEqual([7, 8, 9]);
    });
  });

  describe('Task graph', () => {
    it('preserves tasks when data version changes', () => {
      const dir = tmpDir();

      const graph = createTaskGraph();
      graph.addNode('test-task', {
        title: 'My Task', description: 'Do something', status: 'todo',
        priority: 'high', tags: [], embedding: [1, 2],
        dueDate: null, estimate: null, completedAt: null, assignee: null,
        order: 0, nodeType: 'task',
        createdAt: 1000, updatedAt: 2000, version: 1, attachments: [],
      });
      saveTaskGraph(graph, dir, 'model-v1');

      const file = path.join(dir, 'tasks.json');
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      data.version = GRAPH_DATA_VERSION - 1;
      fs.writeFileSync(file, JSON.stringify(data));

      const loaded = loadTaskGraph(dir, false, 'model-v1');
      expect(loaded.hasNode('test-task')).toBe(true);
      expect(loaded.getNodeAttribute('test-task', 'title')).toBe('My Task');
      expect(loaded.getNodeAttribute('test-task', 'embedding')).toEqual([]);
    });
  });

  describe('Skill graph', () => {
    it('preserves skills when embedding model changes', () => {
      const dir = tmpDir();

      const graph = createSkillGraph();
      graph.addNode('test-skill', {
        title: 'Deploy', description: 'How to deploy', tags: [],
        steps: ['step1'], triggers: ['deploy'], inputHints: [], filePatterns: [],
        source: 'user', confidence: 1, usageCount: 0, lastUsedAt: null,
        embedding: [1, 2], createdAt: 1000, updatedAt: 2000, version: 1,
        attachments: [],
      });
      saveSkillGraph(graph, dir, 'old-model');

      const loaded = loadSkillGraph(dir, false, 'new-model');
      expect(loaded.hasNode('test-skill')).toBe(true);
      expect(loaded.getNodeAttribute('test-skill', 'title')).toBe('Deploy');
      expect(loaded.getNodeAttribute('test-skill', 'steps')).toEqual(['step1']);
      expect(loaded.getNodeAttribute('test-skill', 'embedding')).toEqual([]);
    });
  });
});
