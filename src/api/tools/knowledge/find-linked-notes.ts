import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';

export function register(server: McpServer, mgr: KnowledgeGraphManager): void {
  server.registerTool(
    'find_linked_notes',
    {
      description:
        'Find all notes in the knowledge graph that link to a specific node in the docs, code, files, or tasks graph. ' +
        'This is a reverse lookup — given a target (e.g. a file, a code symbol, or a doc section), ' +
        'returns all notes that reference it via cross-graph relations. ' +
        'Returns an array of { noteId, title, kind, tags }. ' +
        'Use get_note to fetch full content of a returned note.',
      inputSchema: {
        targetId:    z.string().describe('Target node ID in the external graph (e.g. "src/config.ts", "src/auth.ts::login", "docs/api.md::Setup")'),
        targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills']).describe('Which graph the target belongs to'),
        kind:        z.string().optional().describe('Filter by relation kind (e.g. "references", "depends_on"). If omitted, returns all relations.'),
        projectId:   z.string().optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ targetId, targetGraph, kind, projectId }) => {
      const results = mgr.findLinkedNotes(targetGraph, targetId, kind, projectId);
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No notes linked to ${targetGraph}::${targetId}` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
