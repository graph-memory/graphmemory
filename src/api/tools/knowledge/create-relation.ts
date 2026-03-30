import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { KnowledgeGraphManager } from '@/graphs/knowledge';
import { MAX_LINK_KIND_LEN, MAX_PROJECT_ID_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: KnowledgeGraphManager, resolveAuthor: () => string): void {
  server.registerTool(
    'notes_create_link',
    {
      description:
        'Create a directed relation from a note to another note or to a node in the docs/code/files graph. ' +
        'The kind is a free-form string describing the relationship, ' +
        'e.g. "relates_to", "depends_on", "contradicts", "supports", "part_of", "references". ' +
        'Set targetGraph to "docs", "code", "files", or "tasks" to link to a doc chunk, code symbol, file/directory, or task.',
      inputSchema: {
        fromId:      z.string().min(1).max(500).describe('Source note ID'),
        toId:        z.string().min(1).max(500).describe('Target note ID, or target node ID in docs/code/files/tasks graph'),
        kind:        z.string().min(1).max(MAX_LINK_KIND_LEN).describe('Relation type, e.g. "depends_on", "references"'),
        targetGraph: z.enum(['docs', 'code', 'files', 'tasks', 'skills']).optional()
          .describe('Set to "docs", "code", "files", "tasks", or "skills" to create a cross-graph link instead of note-to-note'),
        projectId:   z.string().max(MAX_PROJECT_ID_LEN).optional().describe('Project ID that the target node belongs to. Defaults to the current project.'),
      },
    },
    async ({ fromId, toId, kind, targetGraph, projectId }) => {
      const author = resolveAuthor();
      const created = mgr.createRelation(fromId, toId, kind, targetGraph, projectId, author);

      if (!created) {
        const msg = targetGraph
          ? 'Could not create cross-graph relation — note not found, target not found in ' + targetGraph + ' graph, or relation already exists.'
          : 'Could not create relation — one or both notes not found, or relation already exists.';
        return { content: [{ type: 'text', text: msg }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ fromId, toId, kind, targetGraph, created: true }, null, 2) }] };
    },
  );
}
