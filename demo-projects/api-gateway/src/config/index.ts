/**
 * Configuration loader for the ShopFlow API Gateway.
 * Reads environment variables with sensible defaults for local development.
 * See docs/deployment.md for the full list of supported variables.
 */

import { RateLimitConfig, ServiceConfig } from '../types';

/** Top-level gateway configuration */
export interface GatewayConfig {
  port: number;
  host: string;
  jwtSecret: string;
  jwtExpiresIn: number;
  refreshExpiresIn: number;
  corsOrigins: string[];
  rateLimits: RateLimitConfig;
  services: ServiceConfig[];
  sessionTtl: number;
  logLevel: string;
}

/**
 * Loads configuration from environment variables.
 * Falls back to development-friendly defaults when variables are not set.
 * @returns Fully resolved gateway configuration
 */
export function loadConfig(): GatewayConfig {
  const corsRaw = process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173';
  const corsOrigins = corsRaw.split(',').map((o) => o.trim());

  return {
    port: parseInt(process.env.PORT ?? '4000', 10),
    host: process.env.HOST ?? '0.0.0.0',
    jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
    jwtExpiresIn: parseInt(process.env.JWT_EXPIRES_IN ?? '900', 10),
    refreshExpiresIn: parseInt(process.env.REFRESH_EXPIRES_IN ?? '604800', 10),
    corsOrigins,
    rateLimits: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
      burstSize: parseInt(process.env.RATE_LIMIT_BURST ?? '20', 10),
      keyPrefix: 'rl:',
    },
    services: buildServiceRegistry(),
    sessionTtl: parseInt(process.env.SESSION_TTL ?? '86400', 10),
    logLevel: process.env.LOG_LEVEL ?? 'info',
  };
}

/**
 * Builds the downstream service registry from environment variables.
 * Each service follows the pattern: SERVICE_<NAME>_URL, SERVICE_<NAME>_TIMEOUT.
 */
function buildServiceRegistry(): ServiceConfig[] {
  return [
    {
      name: 'catalog',
      baseUrl: process.env.SERVICE_CATALOG_URL ?? 'http://localhost:4001',
      healthPath: '/health',
      timeout: parseInt(process.env.SERVICE_CATALOG_TIMEOUT ?? '5000', 10),
      retries: 2,
      circuitBreaker: { failureThreshold: 5, resetTimeout: 30000, halfOpenRequests: 2 },
    },
    {
      name: 'orders',
      baseUrl: process.env.SERVICE_ORDERS_URL ?? 'http://localhost:4002',
      healthPath: '/health',
      timeout: parseInt(process.env.SERVICE_ORDERS_TIMEOUT ?? '5000', 10),
      retries: 2,
      circuitBreaker: { failureThreshold: 5, resetTimeout: 30000, halfOpenRequests: 2 },
    },
    {
      name: 'payments',
      baseUrl: process.env.SERVICE_PAYMENTS_URL ?? 'http://localhost:4003',
      healthPath: '/health',
      timeout: parseInt(process.env.SERVICE_PAYMENTS_TIMEOUT ?? '3000', 10),
      retries: 1,
      circuitBreaker: { failureThreshold: 3, resetTimeout: 60000, halfOpenRequests: 1 },
    },
  ];
}
