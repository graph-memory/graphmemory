/**
 * Health Controller for the ShopFlow API Gateway.
 * Implements Kubernetes-compatible health check endpoints:
 * - /health — overall gateway status summary
 * - /health/ready — readiness probe (are downstream services reachable?)
 * - /health/live — liveness probe (is the gateway process healthy?)
 * See docs/deployment.md for Kubernetes probe configuration.
 */

import { GatewayRequest, GatewayResponse, ServiceConfig } from '../types';
import { getCircuitStates, CircuitState } from '../services/routing-service';

/** Health status for a single downstream service */
export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  circuitState: CircuitState;
  latency: number | null;
}

/** Overall gateway health summary */
export interface HealthSummary {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  services: ServiceHealth[];
  timestamp: string;
}

/** Gateway process start time for uptime calculation */
const startTime = Date.now();

/** Gateway version — read from package.json in production */
const GATEWAY_VERSION = '1.0.0';

/**
 * Handles GET /health — returns a full health summary including
 * downstream service status derived from circuit breaker states.
 * @param request - The gateway request
 * @param services - Configured downstream services
 * @returns GatewayResponse with health summary
 */
export function handleHealth(request: GatewayRequest, services: ServiceConfig[]): GatewayResponse {
  const summary = buildHealthSummary(services);
  const status = summary.status === 'healthy' ? 200 : summary.status === 'degraded' ? 200 : 503;

  return {
    status,
    data: summary,
    correlationId: request.correlationId,
    duration: Date.now() - request.startTime,
  };
}

/**
 * Handles GET /health/ready — readiness probe.
 * Returns 200 if at least one downstream service has a closed circuit.
 * Returns 503 if all circuits are open (gateway cannot serve traffic).
 * @param request - The gateway request
 * @param services - Configured downstream services
 * @returns GatewayResponse indicating readiness
 */
export function handleReadiness(request: GatewayRequest, services: ServiceConfig[]): GatewayResponse {
  const circuitStates = getCircuitStates();
  const hasHealthyService = services.some((s) => circuitStates[s.name] !== CircuitState.Open);

  return {
    status: hasHealthyService ? 200 : 503,
    data: { ready: hasHealthyService, circuits: circuitStates },
    correlationId: request.correlationId,
    duration: Date.now() - request.startTime,
  };
}

/**
 * Handles GET /health/live — liveness probe.
 * Always returns 200 unless the process is stuck. This endpoint is
 * intentionally simple — if the gateway can respond, it is alive.
 * @param request - The gateway request
 * @returns GatewayResponse confirming liveness
 */
export function handleLiveness(request: GatewayRequest): GatewayResponse {
  return {
    status: 200,
    data: { alive: true, uptime: Math.floor((Date.now() - startTime) / 1000), pid: process.pid },
    correlationId: request.correlationId,
    duration: Date.now() - request.startTime,
  };
}

/**
 * Builds a comprehensive health summary from circuit breaker states.
 * Maps circuit states to health statuses:
 * - Closed -> healthy, HalfOpen -> degraded, Open -> unhealthy
 */
function buildHealthSummary(services: ServiceConfig[]): HealthSummary {
  const circuitStates = getCircuitStates();

  const serviceHealths: ServiceHealth[] = services.map((s) => {
    const circuit = circuitStates[s.name] ?? CircuitState.Closed;
    const healthStatus = circuit === CircuitState.Closed ? 'healthy' : circuit === CircuitState.HalfOpen ? 'degraded' : 'unhealthy';
    return { name: s.name, status: healthStatus, circuitState: circuit, latency: null };
  });

  const unhealthyCount = serviceHealths.filter((s) => s.status === 'unhealthy').length;
  const overallStatus = unhealthyCount === serviceHealths.length ? 'unhealthy' : unhealthyCount > 0 ? 'degraded' : 'healthy';

  return {
    status: overallStatus,
    version: GATEWAY_VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    services: serviceHealths,
    timestamp: new Date().toISOString(),
  };
}
