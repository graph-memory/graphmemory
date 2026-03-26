import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Response, Request } from 'express';
import type { UserConfig } from '@/lib/multi-config';

// ---------------------------------------------------------------------------
// Password hashing (scrypt)
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 65536;    // N
const SCRYPT_BLOCK = 8;       // r
const SCRYPT_PARALLEL = 1;    // p
const SCRYPT_MAXMEM = 128 * 1024 * 1024; // 128 MiB (needed for N=65536, r=8)

/**
 * Hash a password using scrypt. Returns a string: `$scrypt$N$r$p$salt$hash`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST, r: SCRYPT_BLOCK, p: SCRYPT_PARALLEL, maxmem: SCRYPT_MAXMEM }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
  return `$scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK}$${SCRYPT_PARALLEL}$${salt}$${derived.toString('hex')}`;
}

/**
 * Verify a password against a stored hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$');
  // Format: $scrypt$N$r$p$salt$hash → ['', 'scrypt', N, r, p, salt, hash]
  if (parts.length !== 7 || parts[1] !== 'scrypt') return false;
  const N = parseInt(parts[2], 10);
  const r = parseInt(parts[3], 10);
  const p = parseInt(parts[4], 10);
  const salt = parts[5];
  const expectedHash = parts[6];

  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, { N, r, p, maxmem: SCRYPT_MAXMEM }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });

  const derivedHex = derived.toString('hex');
  // Timing-safe comparison
  if (derivedHex.length !== expectedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(derivedHex), Buffer.from(expectedHash));
}

// ---------------------------------------------------------------------------
// JWT tokens
// ---------------------------------------------------------------------------

export interface JwtPayload {
  userId: string;
  type: 'access' | 'refresh' | 'oauth_access' | 'oauth_refresh';
}

/**
 * Parse a TTL string like "15m", "1h", "7d" into seconds.
 */
export function parseTtl(ttl: string): number {
  const match = ttl.match(/^(\d+)(s|m|h|d)$/);
  if (!match) throw new Error(`Invalid TTL format: "${ttl}". Expected e.g. "15m", "1h", "7d"`);
  const value = parseInt(match[1], 10);
  if (value <= 0) throw new Error(`TTL must be positive, got "${ttl}"`);
  switch (match[2]) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 3600;
    case 'd': return value * 86400;
    default: throw new Error(`Invalid TTL unit: ${match[2]}`);
  }
}

export function signAccessToken(userId: string, secret: string, ttl: string): string {
  const payload: JwtPayload = { userId, type: 'access' };
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: parseTtl(ttl) });
}

export function signRefreshToken(userId: string, secret: string, ttl: string): string {
  const payload: JwtPayload = { userId, type: 'refresh' };
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: parseTtl(ttl) });
}

export function signOAuthToken(userId: string, secret: string, ttl: string): string {
  const payload: JwtPayload = { userId, type: 'oauth_access' };
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: parseTtl(ttl) });
}

export function signOAuthRefreshToken(userId: string, secret: string, ttl: string): string {
  const payload: JwtPayload = { userId, type: 'oauth_refresh' };
  return jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: parseTtl(ttl) });
}

export function verifyToken(token: string, secret: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload & jwt.JwtPayload;
    if (!decoded.userId || !decoded.type) return null;
    return { userId: decoded.userId, type: decoded.type };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

const ACCESS_COOKIE = 'mgm_access';
const REFRESH_COOKIE = 'mgm_refresh';

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string, refreshTtl: string, secureCookie?: boolean): void {
  const secure = secureCookie ?? process.env.NODE_ENV !== 'development';
  res.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api',
    maxAge: parseTtl(refreshTtl) * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: '/api/auth/refresh',
    maxAge: parseTtl(refreshTtl) * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { path: '/api' });
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth/refresh' });
}

export function getAccessToken(req: Request): string | undefined {
  return req.cookies?.[ACCESS_COOKIE];
}

export function getRefreshToken(req: Request): string | undefined {
  return req.cookies?.[REFRESH_COOKIE];
}

// ---------------------------------------------------------------------------
// User lookup by email
// ---------------------------------------------------------------------------

export function resolveUserByEmail(
  email: string,
  users: Record<string, UserConfig>,
): { userId: string; user: UserConfig } | undefined {
  for (const [userId, user] of Object.entries(users)) {
    if (user.email === email) return { userId, user };
  }
  return undefined;
}
