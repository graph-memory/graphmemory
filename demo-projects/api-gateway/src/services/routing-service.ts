/**
 * Routing Service for the ShopFlow API Gateway.
 * Manages service discovery, request forwarding with retry logic,
 * and circuit breaker state for downstream services.
 * See docs/adr-002-circuit-breaker.md for the circuit breaker design.
 */

import { ServiceConfig } from '../types';

/** Circuit breaker states */
export enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half-open',
}

/** Runtime state for a downstream service's circuit breaker */
interface CircuitBreaker {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number | null;
  successCount: number;
}

/** Service registry with circuit breaker state */
const registry = new Map<string, { config: ServiceConfig; circuit: CircuitBreaker }>();

/**
 * Initializes the service registry from configuration.
 * Call this once at startup with the service list from GatewayConfig.
 * @param services - Array of downstream service configurations
 */
export function initRegistry(services: ServiceConfig[]): void {
  registry.clear();
  for (const config of services) {
    registry.set(config.name, {
      config,
      circuit: { state: CircuitState.Closed, failureCount: 0, lastFailureAt: null, successCount: 0 },
    });
  }
}

/**
 * Resolves a request path to the appropriate downstream service.
 * Routes are matched by the first path segment: /catalog/* -> catalog service.
 * @param path - The incoming request path (e.g., "/catalog/products")
 * @returns The matching service config, or null if no route matches
 */
export function resolveService(path: string): ServiceConfig | null {
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const serviceName = segments[0];
  const entry = registry.get(serviceName);
  return entry?.config ?? null;
}

/**
 * Checks whether the circuit breaker allows requests to a service.
 * Transitions from Open -> HalfOpen when the reset timeout has elapsed.
 * @param serviceName - Name of the downstream service
 * @returns True if requests are allowed
 */
export function isCircuitAllowed(serviceName: string): boolean {
  const entry = registry.get(serviceName);
  if (!entry) return false;

  const { circuit, config } = entry;
  if (circuit.state === CircuitState.Closed) return true;

  if (circuit.state === CircuitState.Open && circuit.lastFailureAt) {
    const elapsed = Date.now() - circuit.lastFailureAt;
    if (elapsed >= config.circuitBreaker.resetTimeout) {
      circuit.state = CircuitState.HalfOpen;
      circuit.successCount = 0;
      return true;
    }
    return false;
  }

  return circuit.state === CircuitState.HalfOpen && circuit.successCount < config.circuitBreaker.halfOpenRequests;
}

/**
 * Records a successful response from a downstream service.
 * In HalfOpen state, enough successes will close the circuit.
 * @param serviceName - Name of the downstream service
 */
export function recordSuccess(serviceName: string): void {
  const entry = registry.get(serviceName);
  if (!entry) return;

  const { circuit, config } = entry;
  if (circuit.state === CircuitState.HalfOpen) {
    circuit.successCount++;
    if (circuit.successCount >= config.circuitBreaker.halfOpenRequests) {
      circuit.state = CircuitState.Closed;
      circuit.failureCount = 0;
    }
  } else {
    circuit.failureCount = 0;
  }
}

/**
 * Records a failure from a downstream service.
 * Trips the circuit to Open when the failure threshold is reached.
 * @param serviceName - Name of the downstream service
 */
export function recordFailure(serviceName: string): void {
  const entry = registry.get(serviceName);
  if (!entry) return;

  const { circuit, config } = entry;
  circuit.failureCount++;
  circuit.lastFailureAt = Date.now();

  if (circuit.failureCount >= config.circuitBreaker.failureThreshold) {
    circuit.state = CircuitState.Open;
  }
}

/**
 * Returns the current circuit breaker state for all registered services.
 * Used by the health controller for diagnostics.
 */
export function getCircuitStates(): Record<string, CircuitState> {
  const states: Record<string, CircuitState> = {};
  for (const [name, entry] of registry) {
    states[name] = entry.circuit.state;
  }
  return states;
}
