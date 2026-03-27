import { DirectedGraph } from 'graphology';
import type { AttachmentMeta } from './attachment-types';

export type CrossGraphType = 'docs' | 'code' | 'files' | 'tasks' | 'skills';

export interface KnowledgeNodeAttributes {
  title: string;
  content: string;
  tags: string[];
  embedding: number[];     // embedded from title + content; [] until filled
  attachments: AttachmentMeta[];
  createdAt: number;       // timestamp ms
  updatedAt: number;       // timestamp ms
  version: number;         // incremented on every mutation (starts at 1)
  createdBy?: string;      // author from config at creation time
  updatedBy?: string;      // author from config at last update
  proxyFor?: { graph: CrossGraphType; nodeId: string; projectId?: string };  // cross-graph proxy node marker
}

export interface KnowledgeEdgeAttributes {
  kind: string;  // free-form relation type, e.g. "relates_to", "depends_on", "contradicts"
}

export type KnowledgeGraph = DirectedGraph<KnowledgeNodeAttributes, KnowledgeEdgeAttributes>;

export function createKnowledgeGraph(): KnowledgeGraph {
  return new DirectedGraph<KnowledgeNodeAttributes, KnowledgeEdgeAttributes>({
    multi: false,
    allowSelfLoops: false,
  });
}

import { randomUUID } from 'crypto';

/**
 * Generate a UUID v4 entity ID.
 * @deprecated Use generateId() for new entities. Legacy slug-based IDs remain valid.
 */
export function slugify(title: string, graph: { hasNode(id: string): boolean }): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!base) return `note-${Date.now()}`;

  if (!graph.hasNode(base)) return base;

  let n = 2;
  while (graph.hasNode(`${base}::${n}`)) n++;
  return `${base}::${n}`;
}

/** Generate a UUID v4 entity ID. */
export function generateId(): string {
  return randomUUID();
}
