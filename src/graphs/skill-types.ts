import { DirectedGraph } from 'graphology';
import type { AttachmentMeta } from './attachment-types';

export type SkillCrossGraphType = 'docs' | 'code' | 'files' | 'knowledge' | 'tasks';

export type SkillSource = 'user' | 'learned';

export interface SkillNodeAttributes {
  title: string;
  description: string;
  steps: string[];
  triggers: string[];
  inputHints: string[];
  filePatterns: string[];
  tags: string[];
  source: SkillSource;
  confidence: number;        // 0-1
  usageCount: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
  embedding: number[];
  attachments: AttachmentMeta[];
  proxyFor?: { graph: SkillCrossGraphType; nodeId: string };
}

export interface SkillEdgeAttributes {
  kind: string;  // skill↔skill: depends_on, related_to, variant_of; cross-graph: free-form
}

export type SkillGraph = DirectedGraph<SkillNodeAttributes, SkillEdgeAttributes>;

export function createSkillGraph(): SkillGraph {
  return new DirectedGraph<SkillNodeAttributes, SkillEdgeAttributes>({
    multi: false,
    allowSelfLoops: false,
  });
}
