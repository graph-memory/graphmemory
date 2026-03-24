import crypto from 'crypto';
import type { AccessLevel, GraphName, ProjectConfig, WorkspaceConfig, ServerConfig, UserConfig } from '@/lib/multi-config';
import { verifyToken } from '@/lib/jwt';

/**
 * Resolve access level for a user on a specific graph.
 *
 * Resolution chain (first match wins):
 *   graph.access[userId] → project.access[userId] → workspace.access[userId]
 *   → server.access[userId] → server.defaultAccess
 */
export function resolveAccess(
  userId: string | undefined,
  graphName: GraphName,
  projectConfig: ProjectConfig,
  serverConfig: ServerConfig,
  workspaceConfig?: WorkspaceConfig,
): AccessLevel {
  if (!userId) return serverConfig.defaultAccess;

  // 1. Graph-level
  const graphAccess = projectConfig.graphConfigs[graphName].access?.[userId];
  if (graphAccess) return graphAccess;

  // 2. Project-level
  const projectAccess = projectConfig.access?.[userId];
  if (projectAccess) return projectAccess;

  // 3. Workspace-level
  if (workspaceConfig) {
    const wsAccess = workspaceConfig.access?.[userId];
    if (wsAccess) return wsAccess;
  }

  // 4. Server-level
  const serverAccess = serverConfig.access?.[userId];
  if (serverAccess) return serverAccess;

  // 5. Default
  return serverConfig.defaultAccess;
}

/**
 * Look up a user by API key.
 * Returns { userId, user } or undefined if not found.
 */
export function resolveUserFromApiKey(
  apiKey: string,
  users: Record<string, UserConfig>,
): { userId: string; user: UserConfig } | undefined {
  const keyBuf = Buffer.from(apiKey);
  for (const [userId, user] of Object.entries(users)) {
    const userKeyBuf = Buffer.from(user.apiKey);
    if (keyBuf.length === userKeyBuf.length && crypto.timingSafeEqual(keyBuf, userKeyBuf)) {
      return { userId, user };
    }
  }
  return undefined;
}

/**
 * Resolve a user from a Bearer token — tries OAuth JWT first, then falls back to API key.
 * Used by MCP HTTP handler to accept both OAuth tokens and legacy API keys.
 */
export function resolveUserFromBearer(
  token: string,
  users: Record<string, UserConfig>,
  jwtSecret?: string,
): { userId: string; user: UserConfig } | undefined {
  if (jwtSecret) {
    const payload = verifyToken(token, jwtSecret);
    if (payload?.type === 'oauth_access') {
      const user = users[payload.userId];
      if (user) return { userId: payload.userId, user };
    }
  }
  return resolveUserFromApiKey(token, users);
}

/**
 * Check if an access level allows read operations.
 */
export function canRead(level: AccessLevel): boolean {
  return level === 'r' || level === 'rw';
}

/**
 * Check if an access level allows write operations.
 */
export function canWrite(level: AccessLevel): boolean {
  return level === 'rw';
}
