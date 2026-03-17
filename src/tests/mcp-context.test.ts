import { setupMcpClient, json } from './helpers';

interface ContextResult {
  projectId: string | null;
  workspaceId: string | null;
  workspaceProjects: string[] | null;
  hasWorkspace: boolean;
}

describe('get_context tool', () => {
  it('returns projectId without workspace', async () => {
    const ctx = await setupMcpClient({
      sessionContext: { projectId: 'my-app' },
    });
    const result = json<ContextResult>(await ctx.call('get_context'));
    expect(result.projectId).toBe('my-app');
    expect(result.workspaceId).toBeNull();
    expect(result.workspaceProjects).toBeNull();
    expect(result.hasWorkspace).toBe(false);
    await ctx.close();
  });

  it('returns workspace info when in workspace', async () => {
    const ctx = await setupMcpClient({
      sessionContext: {
        projectId: 'frontend',
        workspaceId: 'my-ws',
        workspaceProjects: ['frontend', 'backend', 'shared-lib'],
      },
    });
    const result = json<ContextResult>(await ctx.call('get_context'));
    expect(result.projectId).toBe('frontend');
    expect(result.workspaceId).toBe('my-ws');
    expect(result.workspaceProjects).toEqual(['frontend', 'backend', 'shared-lib']);
    expect(result.hasWorkspace).toBe(true);
    await ctx.close();
  });

  it('returns nulls when no session context', async () => {
    const ctx = await setupMcpClient({});
    const result = json<ContextResult>(await ctx.call('get_context'));
    expect(result.projectId).toBeNull();
    expect(result.hasWorkspace).toBe(false);
    await ctx.close();
  });

  it('is always registered even without graphs', async () => {
    const ctx = await setupMcpClient({
      sessionContext: { projectId: 'test' },
    });
    const tools = await ctx.client.listTools();
    const names = tools.tools.map((t: any) => t.name);
    expect(names).toContain('get_context');
    await ctx.close();
  });
});
