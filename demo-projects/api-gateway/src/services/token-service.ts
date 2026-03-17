/**
 * Token Service for the ShopFlow API Gateway.
 * Handles JWT signing, verification, refresh token rotation, and revocation.
 * Access tokens are short-lived JWTs; refresh tokens are opaque hex strings
 * stored in an in-memory revocation set. See docs/auth-flow.md for details.
 */

import { createHash } from 'crypto';
import { AuthPayload, Role, TokenPair } from '../types';
import { generateToken } from '../utils/crypto';

/** Simple base64url encoding for JWT segments */
function base64url(data: string): string {
  return Buffer.from(data).toString('base64url');
}

/** Revoked token fingerprints — checked on every verification */
const revokedTokens = new Set<string>();

/** Refresh token store: hash(token) -> { userId, sessionId, expiresAt } */
const refreshStore = new Map<string, { userId: string; sessionId: string; expiresAt: number }>();

/**
 * Creates a signed access token and a paired refresh token.
 * The refresh token is stored internally for later rotation.
 * @param userId - The authenticated user's ID
 * @param email - The user's email address
 * @param role - The user's role for RBAC
 * @param sessionId - The session this token pair belongs to
 * @param secret - JWT signing secret
 * @param expiresIn - Access token TTL in seconds
 * @returns A TokenPair with access and refresh tokens
 */
export function createTokenPair(
  userId: string,
  email: string,
  role: Role,
  sessionId: string,
  secret: string,
  expiresIn: number
): TokenPair {
  const now = Math.floor(Date.now() / 1000);
  const payload: AuthPayload = {
    sub: userId,
    email,
    role,
    sessionId,
    iat: now,
    exp: now + expiresIn,
  };

  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHash('sha256').update(`${header}.${body}.${secret}`).digest('base64url');
  const accessToken = `${header}.${body}.${signature}`;

  const refreshToken = generateToken(64);
  const refreshHash = createHash('sha256').update(refreshToken).digest('hex');
  refreshStore.set(refreshHash, { userId, sessionId, expiresAt: now + 604800 });

  return { accessToken, refreshToken, expiresIn };
}

/**
 * Verifies an access token and returns its decoded payload.
 * Checks signature, expiration, and revocation status.
 * @param token - The JWT access token string
 * @param secret - The signing secret to verify against
 * @returns The decoded AuthPayload, or null if invalid
 */
export function verifyAccessToken(token: string, secret: string): AuthPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSig = createHash('sha256').update(`${header}.${body}.${secret}`).digest('base64url');
  if (signature !== expectedSig) return null;

  const fingerprint = createHash('sha256').update(token).digest('hex');
  if (revokedTokens.has(fingerprint)) return null;

  const payload: AuthPayload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

/**
 * Revokes an access token by adding its fingerprint to the revocation set.
 * @param token - The JWT to revoke
 */
export function revokeToken(token: string): void {
  const fingerprint = createHash('sha256').update(token).digest('hex');
  revokedTokens.add(fingerprint);
}

/**
 * Validates a refresh token and removes it from the store (single-use rotation).
 * @param refreshToken - The opaque refresh token
 * @returns The associated userId and sessionId, or null if invalid
 */
export function consumeRefreshToken(refreshToken: string): { userId: string; sessionId: string } | null {
  const hash = createHash('sha256').update(refreshToken).digest('hex');
  const entry = refreshStore.get(hash);
  if (!entry) return null;

  refreshStore.delete(hash);
  if (entry.expiresAt < Math.floor(Date.now() / 1000)) return null;

  return { userId: entry.userId, sessionId: entry.sessionId };
}
