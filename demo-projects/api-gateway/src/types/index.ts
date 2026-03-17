/**
 * Core type definitions for the ShopFlow API Gateway.
 * Shared across controllers, services, and middleware.
 */

/** Supported user roles for RBAC */
export enum Role {
  Customer = 'customer',
  Admin = 'admin',
  Merchant = 'merchant',
  Support = 'support',
}

/** Registered user record */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  createdAt: Date;
  lastLoginAt: Date | null;
}

/** JWT token payload embedded in access tokens */
export interface AuthPayload {
  sub: string;
  email: string;
  role: Role;
  sessionId: string;
  iat: number;
  exp: number;
}

/** Token pair returned on login and refresh */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Downstream service configuration */
export interface ServiceConfig {
  name: string;
  baseUrl: string;
  healthPath: string;
  timeout: number;
  retries: number;
  circuitBreaker: CircuitBreakerConfig;
}

/** Circuit breaker settings per service */
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

/** Rate limiting configuration */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  burstSize: number;
  keyPrefix: string;
}

/** Rate limit status for a given key */
export interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: Date;
  retryAfter: number | null;
}

/** Incoming gateway request after auth enrichment */
export interface GatewayRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  auth?: AuthPayload;
  correlationId: string;
  startTime: number;
}

/** Standardized gateway response envelope */
export interface GatewayResponse<T = unknown> {
  status: number;
  data?: T;
  error?: string;
  correlationId: string;
  duration: number;
}
