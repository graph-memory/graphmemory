/**
 * CORS Middleware for the ShopFlow API Gateway.
 * Handles Cross-Origin Resource Sharing headers and preflight OPTIONS requests.
 * Configured via the `corsOrigins` array in GatewayConfig.
 * See docs/deployment.md for allowed origin configuration.
 */

import { GatewayRequest, GatewayResponse } from '../types';

/** Standard CORS headers applied to all responses */
const CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const CORS_HEADERS = 'Content-Type, Authorization, X-Correlation-ID, X-Request-ID';
const CORS_MAX_AGE = '86400';

/**
 * Configuration for the CORS middleware.
 * Supports exact origin matching and wildcard (*) mode.
 */
export interface CorsConfig {
  allowedOrigins: string[];
  allowCredentials: boolean;
  exposeHeaders: string[];
}

/**
 * Creates a default CORS configuration from the gateway's allowed origins list.
 * @param origins - Array of allowed origin URLs
 * @returns A CorsConfig object
 */
export function createCorsConfig(origins: string[]): CorsConfig {
  return {
    allowedOrigins: origins,
    allowCredentials: true,
    exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Correlation-ID'],
  };
}

/**
 * Checks whether a request origin is allowed by the CORS configuration.
 * Supports wildcard mode when the origins list contains "*".
 * @param origin - The Origin header from the request
 * @param config - The CORS configuration
 * @returns True if the origin is permitted
 */
export function isOriginAllowed(origin: string | undefined, config: CorsConfig): boolean {
  if (!origin) return false;
  if (config.allowedOrigins.includes('*')) return true;
  return config.allowedOrigins.includes(origin);
}

/**
 * Builds CORS response headers for an allowed request.
 * @param origin - The validated request origin
 * @param config - The CORS configuration
 * @returns A record of CORS headers to attach to the response
 */
export function buildCorsHeaders(origin: string, config: CorsConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': CORS_METHODS,
    'Access-Control-Allow-Headers': CORS_HEADERS,
    'Access-Control-Max-Age': CORS_MAX_AGE,
  };

  if (config.allowCredentials) {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  if (config.exposeHeaders.length > 0) {
    headers['Access-Control-Expose-Headers'] = config.exposeHeaders.join(', ');
  }

  return headers;
}

/**
 * Handles a CORS preflight (OPTIONS) request.
 * Returns a 204 No Content response with appropriate CORS headers.
 * @param request - The incoming preflight request
 * @param config - The CORS configuration
 * @returns A GatewayResponse for the preflight, or null if not a preflight
 */
export function handlePreflight(request: GatewayRequest, config: CorsConfig): GatewayResponse | null {
  if (request.method !== 'OPTIONS') return null;

  const origin = request.headers['origin'];
  if (!isOriginAllowed(origin, config)) {
    return {
      status: 403,
      error: 'Origin not allowed',
      correlationId: request.correlationId,
      duration: Date.now() - request.startTime,
    };
  }

  return {
    status: 204,
    correlationId: request.correlationId,
    duration: Date.now() - request.startTime,
  };
}
