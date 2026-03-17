/**
 * Session Service for the ShopFlow API Gateway.
 * Manages server-side sessions backed by an in-memory store.
 * Sessions complement JWTs by providing immediate revocation capability —
 * even if a JWT is still valid, it will be rejected if the session is gone.
 * See docs/adr-001-jwt-vs-sessions.md for the hybrid approach rationale.
 */

import { generateToken } from '../utils/crypto';
import { Role } from '../types';

/** Session record stored in the session map */
export interface Session {
  id: string;
  userId: string;
  role: Role;
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
}

/** In-memory session store keyed by session ID */
const sessions = new Map<string, Session>();

/**
 * Creates a new session and stores it in the session map.
 * @param userId - The authenticated user's ID
 * @param role - The user's role
 * @param ipAddress - Client IP address for audit logging
 * @param userAgent - Client user-agent string
 * @param ttlSeconds - Session time-to-live in seconds
 * @returns The newly created session
 */
export function createSession(
  userId: string,
  role: Role,
  ipAddress: string,
  userAgent: string,
  ttlSeconds: number
): Session {
  const now = new Date();
  const session: Session = {
    id: generateToken(32),
    userId,
    role,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    ipAddress,
    userAgent,
  };
  sessions.set(session.id, session);
  return session;
}

/**
 * Validates a session by ID and updates the last-accessed timestamp.
 * Returns null if the session does not exist or has expired.
 * @param sessionId - The session ID to validate
 * @returns The session if valid, or null
 */
export function validateSession(sessionId: string): Session | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    sessions.delete(sessionId);
    return null;
  }

  session.lastAccessedAt = new Date();
  return session;
}

/**
 * Destroys a session, effectively logging the user out.
 * Combined with token revocation, this provides immediate access denial.
 * @param sessionId - The session ID to destroy
 * @returns True if the session existed and was removed
 */
export function destroySession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Removes all expired sessions from the store.
 * Should be called periodically (e.g., every 60 seconds) via setInterval.
 * @returns The number of sessions cleaned up
 */
export function cleanupExpiredSessions(): number {
  const now = new Date();
  let removed = 0;
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(id);
      removed++;
    }
  }
  return removed;
}

/**
 * Returns all active sessions for a given user.
 * Useful for "active sessions" UI and forced logout across devices.
 * @param userId - The user to query
 * @returns Array of active sessions
 */
export function getUserSessions(userId: string): Session[] {
  return Array.from(sessions.values()).filter(
    (s) => s.userId === userId && s.expiresAt >= new Date()
  );
}
