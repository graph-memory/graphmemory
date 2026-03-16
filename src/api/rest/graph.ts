import { Router } from 'express';
import type { ProjectInstance } from '@/lib/project-manager';
import { validateQuery, graphExportSchema } from '@/api/rest/validation';

interface GraphExport {
  nodes: Array<{ id: string; graph: string; [k: string]: any }>;
  edges: Array<{ source: string; target: string; graph: string; [k: string]: any }>;
}

function exportGraph(graph: any, graphName: string): GraphExport {
  const nodes: GraphExport['nodes'] = [];
  const edges: GraphExport['edges'] = [];

  graph.forEachNode((id: string, attrs: any) => {
    // Skip proxy nodes and embeddings for transfer size
    const { embedding, fileEmbedding, ...rest } = attrs;
    nodes.push({ id, graph: graphName, ...rest });
  });

  graph.forEachEdge((_edge: string, attrs: any, source: string, target: string) => {
    edges.push({ source, target, graph: graphName, ...attrs });
  });

  return { nodes, edges };
}

export function createGraphRouter(): Router {
  const router = Router({ mergeParams: true });

  function getProject(req: any): ProjectInstance {
    return req.project;
  }

  router.get('/', validateQuery(graphExportSchema), (req, res, next) => {
    try {
      const p = getProject(req);
      const scope = (req as any).validatedQuery.scope;

      const allNodes: GraphExport['nodes'] = [];
      const allEdges: GraphExport['edges'] = [];

      const add = (g: any, name: string) => {
        if (!g) return;
        const exp = exportGraph(g, name);
        allNodes.push(...exp.nodes);
        allEdges.push(...exp.edges);
      };

      if (scope === 'all' || scope === 'docs')      add(p.docGraph, 'docs');
      if (scope === 'all' || scope === 'code')      add(p.codeGraph, 'code');
      if (scope === 'all' || scope === 'knowledge') add(p.knowledgeGraph, 'knowledge');
      if (scope === 'all' || scope === 'tasks')     add(p.taskGraph, 'tasks');
      if (scope === 'all' || scope === 'files')     add(p.fileIndexGraph, 'files');
      if (scope === 'all' || scope === 'skills')    add(p.skillGraph, 'skills');

      res.json({ nodes: allNodes, edges: allEdges });
    } catch (err) { next(err); }
  });

  return router;
}
