/**
 * Authentication Controller for the ShopFlow API Gateway.
 * Handles HTTP endpoints for login, logout, registration, and token refresh.
 * Delegates business logic to AuthService. See docs/api-reference.md for
 * request/response formats and docs/auth-flow.md for the full flow.
 */

import { GatewayRequest, GatewayResponse, Role } from '../types';
import { login, logout, register, refreshTokens } from '../services/auth-service';
import { GatewayConfig } from '../config';

/** Expected shape of the login request body */
interface LoginBody {
  email: string;
  password: string;
}

/** Expected shape of the registration request body */
interface RegisterBody {
  email: string;
  password: string;
  role?: Role;
}

/** Expected shape of the refresh request body */
interface RefreshBody {
  refreshToken: string;
}

/**
 * Handles POST /auth/login requests.
 * Validates credentials and returns a JWT access token + refresh token pair.
 * @param request - The gateway request with login credentials in the body
 * @param config - Gateway configuration for JWT settings
 * @returns GatewayResponse with tokens on success, or error details
 */
export function handleLogin(request: GatewayRequest, config: GatewayConfig): GatewayResponse {
  const body = request.body as LoginBody;
  if (!body?.email || !body?.password) {
    return { status: 400, error: 'Email and password are required', correlationId: request.correlationId, duration: Date.now() - request.startTime };
  }

  try {
    const tokens = login(body.email, body.password, request.headers['x-forwarded-for'] ?? '127.0.0.1', request.headers['user-agent'] ?? 'unknown', config);
    return { status: 200, data: tokens, correlationId: request.correlationId, duration: Date.now() - request.startTime };
  } catch (err) {
    return { status: 401, error: (err as Error).message, correlationId: request.correlationId, duration: Date.now() - request.startTime };
  }
}

/**
 * Handles POST /auth/register requests.
 * Creates a new user account with the given credentials.
 * @param request - The gateway request with registration details in the body
 * @returns GatewayResponse with the created user (sans password) on success
 */
export function handleRegister(request: GatewayRequest): GatewayResponse {
  const body = request.body as RegisterBody;
  if (!body?.email || !body?.password) {
    return { status: 400, error: 'Email and password are required', correlationId: request.correlationId, duration: Date.now() - request.startTime };
  }

  try {
    const user = register(body.email, body.password, body.role);
    return { status: 201, data: user, correlationId: request.correlationId, duration: Date.now() - request.startTime };
  } catch (err) {
    return { status: 409, error: (err as Error).message, correlationId: request.correlationId, duration: Date.now() - request.startTime };
  }
}

/**
 * Handles POST /auth/logout requests.
 * Revokes the access token and destroys the server-side session.
 * Requires a valid authenticated request.
 * @param request - The authenticated gateway request
 * @returns GatewayResponse confirming logout
 */
export function handleLogout(request: GatewayRequest): GatewayResponse {
  if (!request.auth) {
    return { status: 401, error: 'Not authenticated', correlationId: request.correlationId, duration: Date.now() - request.startTime };
  }

  const token = request.headers['authorization']?.split(' ')[1] ?? '';
  logout(token, request.auth.sessionId);
  return { status: 200, data: { message: 'Logged out successfully' }, correlationId: request.correlationId, duration: Date.now() - request.startTime };
}

/**
 * Handles POST /auth/refresh requests.
 * Rotates the refresh token and issues a new access token.
 * @param request - The gateway request with refresh token in the body
 * @param config - Gateway configuration
 * @returns GatewayResponse with new token pair, or 401 on failure
 */
export function handleRefresh(request: GatewayRequest, config: GatewayConfig): GatewayResponse {
  const body = request.body as RefreshBody;
  if (!body?.refreshToken) {
    return { status: 400, error: 'Refresh token is required', correlationId: request.correlationId, duration: Date.now() - request.startTime };
  }

  const tokens = refreshTokens(body.refreshToken, config);
  if (!tokens) {
    return { status: 401, error: 'Invalid or expired refresh token', correlationId: request.correlationId, duration: Date.now() - request.startTime };
  }

  return { status: 200, data: tokens, correlationId: request.correlationId, duration: Date.now() - request.startTime };
}
