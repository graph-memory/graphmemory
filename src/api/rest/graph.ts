import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateQuery, graphExportSchema } from '@/api/rest/validation';
import type { GraphName } from '@/lib/multi-config';

export type GraphAccessChecker = (req: any, graphName: GraphName) => boolean;

interface GraphExport {
  nodes: Array<{ id: string; graph: string; [k: string]: any }>;
  edges: Array<{ source: string; target: string; graph: string; [k: string]: any }>;
}

function exportGraph(graph: any, graphName: string): GraphExport {
  const nodes: GraphExport['nodes'] = [];
  const edges: GraphExport['edges'] = [];

  graph.forEachNode((id: string, attrs: any) => {
    // Skip proxy nodes and embeddings for transfer size
    const { embedding, fileEmbedding, body, pendingImports, pendingEdges, ...rest } = attrs;
    nodes.push({ id, graph: graphName, ...rest });
  });

  graph.forEachEdge((_edge: string, attrs: any, source: string, target: string) => {
    edges.push({ source, target, graph: graphName, ...attrs });
  });

  return { nodes, edges };
}

const GRAPH_TO_PROP: Record<string, keyof ProjectInstance> = {
  docs: 'docGraph',
  code: 'codeGraph',
  knowledge: 'knowledgeGraph',
  tasks: 'taskGraph',
  files: 'fileIndexGraph',
  skills: 'skillGraph',
};

const ALL_GRAPHS: GraphName[] = ['docs', 'code', 'knowledge', 'tasks', 'files', 'skills'];

export function createGraphRouter(canReadGraph?: GraphAccessChecker): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any): ProjectInstance {
    return req.project;
  }

  router.get('/', validateQuery(graphExportSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const scope = (req as any).validatedQuery.scope as string;

      const allNodes: GraphExport['nodes'] = [];
      const allEdges: GraphExport['edges'] = [];

      const add = (g: any, name: string) => {
        if (!g) return;
        const exp = exportGraph(g, name);
        allNodes.push(...exp.nodes);
        allEdges.push(...exp.edges);
      };

      if (scope === 'all') {
        // Export only graphs the user can read
        for (const gn of ALL_GRAPHS) {
          if (canReadGraph && !canReadGraph(req, gn)) continue;
          const prop = GRAPH_TO_PROP[gn];
          add((p as any)[prop], gn);
        }
      } else {
        // Specific graph — check access, 403 if denied
        const gn = scope as GraphName;
        if (canReadGraph && !canReadGraph(req, gn)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        const prop = GRAPH_TO_PROP[gn];
        add((p as any)[prop], gn);
      }

      res.json({ nodes: allNodes, edges: allEdges });
    } catch (err) { next(err); }
  });

  return router;
}
