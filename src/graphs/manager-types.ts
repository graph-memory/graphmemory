import type { DirectedGraph } from 'graphology';
import type { DocGraph } from '@/graphs/docs';
import type { CodeGraph } from '@/graphs/code-types';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import type { FileIndexGraph } from '@/graphs/file-index-types';
import type { TaskGraph } from '@/graphs/task-types';
import type { SkillGraph } from '@/graphs/skill-types';

export type EmbedFn = (query: string) => Promise<number[]>;

export interface GraphManagerContext {
  markDirty: () => void;
  emit: (event: string, data: unknown) => void;
  projectId: string;
  projectDir?: string;
  author: string;
}

/** All graphs available for cross-graph resolution. */
export interface ExternalGraphs {
  docGraph?: DocGraph;
  codeGraph?: CodeGraph;
  knowledgeGraph?: KnowledgeGraph;
  fileIndexGraph?: FileIndexGraph;
  taskGraph?: TaskGraph;
  skillGraph?: SkillGraph;
}

/** No-op context for tests and single-project stdio mode. */
export function noopContext(projectId = ''): GraphManagerContext {
  return {
    markDirty: () => {},
    emit: () => {},
    projectId,
    author: '',
  };
}

/**
 * Resolve a targetGraph string to the actual graph instance.
 * Used for cross-graph relation creation.
 */
export function resolveExternalGraph(
  ext: ExternalGraphs,
  targetGraph: string,
): DirectedGraph | undefined {
  switch (targetGraph) {
    case 'docs': return ext.docGraph;
    case 'code': return ext.codeGraph;
    case 'files': return ext.fileIndexGraph;
    case 'knowledge': return ext.knowledgeGraph;
    case 'tasks': return ext.taskGraph;
    case 'skills': return ext.skillGraph;
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// Reverse lookup: find cross-graph links pointing to a node from external graphs
// ---------------------------------------------------------------------------

export interface IncomingCrossLink {
  sourceId: string;
  sourceGraph: string;
  kind: string;
}

/**
 * Find all cross-graph links that point to `nodeId` in `graphName`
 * by scanning proxy nodes in Knowledge and Task graphs.
 * Used by read-only graph getters (docs, code, files) to show incoming links.
 */
export function findIncomingCrossLinks(
  ext: ExternalGraphs,
  graphName: string,
  nodeId: string,
): IncomingCrossLink[] {
  const results: IncomingCrossLink[] = [];

  // Check KnowledgeGraph for proxy nodes like @docs::nodeId, @code::nodeId, @files::nodeId
  if (ext.knowledgeGraph) {
    const pId = `@${graphName}::${nodeId}`;
    if (ext.knowledgeGraph.hasNode(pId)) {
      ext.knowledgeGraph.forEachInEdge(pId, (_edge, attrs, source) => {
        const sourceAttrs = ext.knowledgeGraph!.getNodeAttributes(source);
        if (sourceAttrs.proxyFor) return; // skip proxy-to-proxy
        results.push({
          sourceId: source,
          sourceGraph: 'knowledge',
          kind: (attrs as { kind: string }).kind,
        });
      });
    }
  }

  // Check TaskGraph for proxy nodes like @docs::nodeId, @code::nodeId, @files::nodeId
  if (ext.taskGraph) {
    const pId = `@${graphName}::${nodeId}`;
    if (ext.taskGraph.hasNode(pId)) {
      ext.taskGraph.forEachInEdge(pId, (_edge, attrs, source) => {
        const sourceAttrs = ext.taskGraph!.getNodeAttributes(source);
        if (sourceAttrs.proxyFor) return; // skip proxy-to-proxy
        results.push({
          sourceId: source,
          sourceGraph: 'tasks',
          kind: (attrs as { kind: string }).kind,
        });
      });
    }
  }

  // Check SkillGraph for proxy nodes
  if (ext.skillGraph) {
    const pId = `@${graphName}::${nodeId}`;
    if (ext.skillGraph.hasNode(pId)) {
      ext.skillGraph.forEachInEdge(pId, (_edge, attrs, source) => {
        const sourceAttrs = ext.skillGraph!.getNodeAttributes(source);
        if (sourceAttrs.proxyFor) return;
        results.push({
          sourceId: source,
          sourceGraph: 'skills',
          kind: (attrs as { kind: string }).kind,
        });
      });
    }
  }

  return results;
}
