import type { DirectedGraph } from 'graphology';
import type { KnowledgeGraph } from '@/graphs/knowledge-types';
import type { TaskGraph } from '@/graphs/task-types';
import type { SkillGraph } from '@/graphs/skill-types';

export type EmbedFn = (query: string) => Promise<number[]>;

/** Document (indexing) and query (search) embed functions. */
export interface EmbedFns {
  document: EmbedFn;
  query: EmbedFn;
}

export interface GraphManagerContext {
  markDirty: () => void;
  emit: (event: string, data: unknown) => void;
  projectId: string;
  projectDir?: string;
  /** Override for mirror file location (workspace mode uses workspace mirrorDir). */
  mirrorDir?: string;
  author: string;
}

/** All graphs available for cross-graph resolution (user-managed only). */
export interface ExternalGraphs {
  knowledgeGraph?: KnowledgeGraph;
  taskGraph?: TaskGraph;
  skillGraph?: SkillGraph;
}

/** Thrown when an update specifies an expectedVersion that doesn't match the current node version. */
export class VersionConflictError extends Error {
  constructor(public readonly current: number, public readonly expected: number) {
    super(`Version conflict: expected ${expected}, current is ${current}`);
    this.name = 'VersionConflictError';
  }
}

/** No-op context for tests. */
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
 */
export function resolveExternalGraph(
  ext: ExternalGraphs,
  targetGraph: string,
): DirectedGraph | undefined {
  switch (targetGraph) {
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
 * by scanning proxy nodes in Knowledge, Task, and Skill graphs.
 */
export function findIncomingCrossLinks(
  ext: ExternalGraphs,
  graphName: string,
  nodeId: string,
  projectId?: string,
): IncomingCrossLink[] {
  const results: IncomingCrossLink[] = [];

  // Candidate proxy IDs: legacy format + project-scoped format
  const candidates = [`@${graphName}::${nodeId}`];
  if (projectId) candidates.push(`@${graphName}::${projectId}::${nodeId}`);

  function scanGraph(
    graph: DirectedGraph | undefined,
    sourceGraphName: string,
  ): void {
    if (!graph) return;
    for (const pId of candidates) {
      if (!graph.hasNode(pId)) continue;
      graph.forEachInEdge(pId, (_edge, attrs, source) => {
        const sourceAttrs = graph.getNodeAttributes(source);
        if (sourceAttrs.proxyFor) return; // skip proxy-to-proxy
        results.push({
          sourceId: source,
          sourceGraph: sourceGraphName,
          kind: (attrs as { kind: string }).kind,
        });
      });
    }
  }

  scanGraph(ext.knowledgeGraph, 'knowledge');
  scanGraph(ext.taskGraph, 'tasks');
  scanGraph(ext.skillGraph, 'skills');

  return results;
}
