/**
 * Authentication Service for the ShopFlow API Gateway.
 * Orchestrates user registration, login, logout, and token refresh.
 * Delegates to TokenService for JWT operations and SessionService for
 * server-side session management. See docs/auth-flow.md for the full flow.
 */

import { Role, TokenPair, User } from '../types';
import { hashPassword, comparePassword } from '../utils/crypto';
import { generateToken } from '../utils/crypto';
import { createTokenPair, revokeToken, consumeRefreshToken } from './token-service';
import { createSession, destroySession, validateSession } from './session-service';
import { GatewayConfig } from '../config';

/** In-memory user store — production would use a database */
const users = new Map<string, User>();

/**
 * Registers a new user account.
 * @param email - User's email address (must be unique)
 * @param password - Plaintext password (will be hashed)
 * @param role - Initial role assignment (defaults to Customer)
 * @returns The created user (without password hash)
 * @throws Error if email is already registered
 */
export function register(email: string, password: string, role: Role = Role.Customer): Omit<User, 'passwordHash'> {
  if (Array.from(users.values()).some((u) => u.email === email)) {
    throw new Error(`Email already registered: ${email}`);
  }

  const user: User = {
    id: generateToken(16),
    email,
    passwordHash: hashPassword(password),
    role,
    createdAt: new Date(),
    lastLoginAt: null,
  };
  users.set(user.id, user);

  const { passwordHash: _, ...safe } = user;
  return safe;
}

/**
 * Authenticates a user and creates a session + token pair.
 * @param email - User's email address
 * @param password - Plaintext password to verify
 * @param ipAddress - Client IP for session tracking
 * @param userAgent - Client user-agent header
 * @param config - Gateway configuration for JWT settings
 * @returns Token pair with access and refresh tokens
 * @throws Error if credentials are invalid
 */
export function login(
  email: string,
  password: string,
  ipAddress: string,
  userAgent: string,
  config: GatewayConfig
): TokenPair {
  const user = Array.from(users.values()).find((u) => u.email === email);
  if (!user || !comparePassword(password, user.passwordHash)) {
    throw new Error('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  const session = createSession(user.id, user.role, ipAddress, userAgent, config.sessionTtl);

  return createTokenPair(user.id, user.email, user.role, session.id, config.jwtSecret, config.jwtExpiresIn);
}

/**
 * Logs out a user by revoking their access token and destroying the session.
 * @param accessToken - The current access token to revoke
 * @param sessionId - The session ID to destroy
 */
export function logout(accessToken: string, sessionId: string): void {
  revokeToken(accessToken);
  destroySession(sessionId);
}

/**
 * Refreshes an expired access token using a valid refresh token.
 * Implements refresh token rotation: the old refresh token is consumed
 * and a new pair is issued. See docs/auth-flow.md for security details.
 * @param refreshToken - The opaque refresh token
 * @param config - Gateway configuration
 * @returns New token pair, or null if the refresh token is invalid
 */
export function refreshTokens(refreshToken: string, config: GatewayConfig): TokenPair | null {
  const result = consumeRefreshToken(refreshToken);
  if (!result) return null;

  const session = validateSession(result.sessionId);
  if (!session) return null;

  const user = users.get(result.userId);
  if (!user) return null;

  return createTokenPair(user.id, user.email, user.role, session.id, config.jwtSecret, config.jwtExpiresIn);
}
