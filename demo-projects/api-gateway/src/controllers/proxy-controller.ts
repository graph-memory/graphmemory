/**
 * Proxy Controller for the ShopFlow API Gateway.
 * Forwards authenticated requests to downstream microservices (catalog, orders, payments).
 * Integrates with the RoutingService for service discovery and circuit breaker logic.
 * See docs/adr-002-circuit-breaker.md for fault tolerance design.
 */

import { GatewayRequest, GatewayResponse, ServiceConfig } from '../types';
import { resolveService, isCircuitAllowed, recordSuccess, recordFailure } from '../services/routing-service';

/** Simulated downstream response for demonstration purposes */
interface DownstreamResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * Forwards a request to the appropriate downstream service.
 * Checks circuit breaker state before sending and records the outcome.
 * @param request - The authenticated gateway request
 * @returns GatewayResponse from the downstream service, or an error
 */
export function handleProxy(request: GatewayRequest): GatewayResponse {
  const service = resolveService(request.path);
  if (!service) {
    return {
      status: 404,
      error: `No service registered for path: ${request.path}`,
      correlationId: request.correlationId,
      duration: Date.now() - request.startTime,
    };
  }

  if (!isCircuitAllowed(service.name)) {
    return {
      status: 503,
      error: `Service "${service.name}" is temporarily unavailable (circuit open)`,
      correlationId: request.correlationId,
      duration: Date.now() - request.startTime,
    };
  }

  try {
    const response = forwardRequest(request, service);
    recordSuccess(service.name);
    return {
      status: response.status,
      data: response.body,
      correlationId: request.correlationId,
      duration: Date.now() - request.startTime,
    };
  } catch (err) {
    recordFailure(service.name);
    return {
      status: 502,
      error: `Upstream error from "${service.name}": ${(err as Error).message}`,
      correlationId: request.correlationId,
      duration: Date.now() - request.startTime,
    };
  }
}

/**
 * Constructs the downstream URL by stripping the service prefix from the path.
 * For example: /catalog/products/123 -> http://catalog:4001/products/123
 * @param request - The gateway request
 * @param service - The resolved service configuration
 * @returns The full downstream URL
 */
export function buildDownstreamUrl(request: GatewayRequest, service: ServiceConfig): string {
  const pathWithoutPrefix = request.path.replace(`/${service.name}`, '') || '/';
  return `${service.baseUrl}${pathWithoutPrefix}`;
}

/**
 * Builds forwarded headers, adding correlation ID and stripping hop-by-hop headers.
 * Adds X-Forwarded-For and X-Forwarded-Proto for upstream awareness.
 * @param request - The original gateway request
 * @returns Headers suitable for the downstream request
 */
export function buildForwardedHeaders(request: GatewayRequest): Record<string, string> {
  const { host: _host, connection: _conn, ...forwarded } = request.headers;
  return {
    ...forwarded,
    'x-correlation-id': request.correlationId,
    'x-forwarded-for': request.headers['x-forwarded-for'] ?? '127.0.0.1',
    'x-forwarded-proto': 'https',
    'x-gateway-auth': request.auth ? `user:${request.auth.sub}` : 'anonymous',
  };
}

/**
 * Simulates forwarding a request to a downstream service.
 * In production, this would use `fetch` or `http.request` with timeout handling.
 * @param request - The gateway request
 * @param service - The target service configuration
 * @returns A simulated downstream response
 */
function forwardRequest(request: GatewayRequest, service: ServiceConfig): DownstreamResponse {
  const url = buildDownstreamUrl(request, service);
  const _headers = buildForwardedHeaders(request);

  // Simulated response — real implementation would make an HTTP call
  return {
    status: 200,
    body: {
      service: service.name,
      url,
      method: request.method,
      message: `Forwarded to ${service.name}`,
      timeout: service.timeout,
    },
    headers: { 'content-type': 'application/json' },
  };
}
