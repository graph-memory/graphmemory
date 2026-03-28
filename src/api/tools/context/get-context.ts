import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpSessionContext } from '@/api/index';

export function register(server: McpServer, ctx?: McpSessionContext): void {
  server.registerTool(
    'get_context',
    {
      description:
        'Returns the current project and workspace context. ' +
        'Use this to discover which project you are connected to, whether it is part of a workspace, ' +
        'and which other projects are available in the workspace (for cross-graph links with projectId).',
      inputSchema: {},
    },
    async () => {
      const result = {
        projectId: ctx?.projectId ?? null,
        projectDescription: ctx?.projectDescription ?? null,
        workspaceId: ctx?.workspaceId ?? null,
        workspaceProjects: ctx?.workspaceProjects ?? null,
        hasWorkspace: !!ctx?.workspaceId,
      };
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}
