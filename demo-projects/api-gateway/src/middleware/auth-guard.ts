/**
 * Authentication Guard middleware for the ShopFlow API Gateway.
 * Extracts JWT from the Authorization header, verifies it, validates
 * the associated session, and enriches the request with auth context.
 * See docs/auth-flow.md for the full authentication pipeline.
 */

import { AuthPayload, GatewayRequest, GatewayResponse, Role } from '../types';
import { verifyAccessToken } from '../services/token-service';
import { validateSession } from '../services/session-service';

/** Paths that do not require authentication */
const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/health', '/health/ready', '/health/live'];

/**
 * Checks whether a request path is in the public (unauthenticated) list.
 * @param path - The request path to check
 * @returns True if the path is publicly accessible
 */
export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Extracts the Bearer token from an Authorization header value.
 * @param header - The raw Authorization header (e.g., "Bearer eyJ...")
 * @returns The token string, or null if the header is malformed
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * Authenticates a gateway request by verifying the JWT and session.
 * Returns an error response if authentication fails, or enriches the
 * request with the decoded AuthPayload on success.
 * @param request - The incoming gateway request
 * @param jwtSecret - The JWT signing secret
 * @returns An error GatewayResponse if auth fails, or null on success
 */
export function authenticateRequest(
  request: GatewayRequest,
  jwtSecret: string
): GatewayResponse | null {
  if (isPublicPath(request.path)) return null;

  const token = extractBearerToken(request.headers['authorization']);
  if (!token) {
    return {
      status: 401,
      error: 'Missing or malformed Authorization header',
      correlationId: request.correlationId,
      duration: Date.now() - request.startTime,
    };
  }

  const payload = verifyAccessToken(token, jwtSecret);
  if (!payload) {
    return {
      status: 401,
      error: 'Invalid or expired access token',
      correlationId: request.correlationId,
      duration: Date.now() - request.startTime,
    };
  }

  const session = validateSession(payload.sessionId);
  if (!session) {
    return {
      status: 401,
      error: 'Session expired or revoked',
      correlationId: request.correlationId,
      duration: Date.now() - request.startTime,
    };
  }

  request.auth = payload;
  return null;
}

/**
 * Checks whether the authenticated user has the required role.
 * @param auth - The decoded auth payload from the JWT
 * @param requiredRoles - Array of roles that are permitted
 * @returns True if the user holds one of the required roles
 */
export function hasRole(auth: AuthPayload, requiredRoles: Role[]): boolean {
  return requiredRoles.includes(auth.role);
}
