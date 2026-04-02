import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { StoreManager } from '@/lib/store-manager';
import type { GraphName } from '@/store/types';
import { MAX_LINK_KIND_LEN } from '@/lib/defaults';

export function register(server: McpServer, mgr: StoreManager): void {
  server.registerTool(
    'tasks_find_linked',
    {
      description:
        'Find all tasks that link to a specific node in the docs, code, files, knowledge, or skills graph. ' +
        'This is a reverse lookup — given a target, returns all tasks that reference it. ' +
        'Returns an array of { taskId, title, kind, status, priority, tags }. ' +
        'Use tasks_get to fetch full content of a returned task.',
      inputSchema: {
        targetId:    z.number().int().positive().describe('Target node ID in the external graph'),
        targetGraph: z.enum(['docs', 'code', 'files', 'knowledge', 'skills'])
          .describe('Which graph the target belongs to: "docs", "code", "files", "knowledge", or "skills"'),
        kind:        z.string().max(MAX_LINK_KIND_LEN).optional().describe('Filter by relation kind. If omitted, returns all relations.'),
      },
    },
    async ({ targetId, targetGraph, kind }) => {
      // Find edges from tasks → targetGraph where toId = targetId
      const edges = mgr.listEdges({ fromGraph: 'tasks', toGraph: targetGraph as GraphName, toId: targetId });
      const filtered = kind ? edges.filter(e => e.kind === kind) : edges;

      if (filtered.length === 0) {
        return { content: [{ type: 'text', text: `No tasks linked to ${targetGraph}::${targetId}` }] };
      }

      const results = filtered.map(e => {
        const task = mgr.getTask(e.fromId);
        return task ? { taskId: task.id, title: task.title, kind: e.kind, status: task.status, priority: task.priority, tags: task.tags } : null;
      }).filter(Boolean);

      const clean = (_k: string, v: any) => (Array.isArray(v) && v.length === 0 ? undefined : v);
      return { content: [{ type: 'text', text: JSON.stringify(results, clean, 2) }] };
    },
  );
}
