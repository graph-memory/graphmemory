/**
 * Logging Middleware for the ShopFlow API Gateway.
 * Generates correlation IDs, logs request/response pairs, and tracks timing.
 * All log entries include the correlation ID for distributed tracing.
 * See docs/deployment.md for log level configuration.
 */

import { GatewayRequest, GatewayResponse } from '../types';
import { generateToken } from '../utils/crypto';

/** Supported log levels in order of verbosity */
export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
}

/** Structured log entry for JSON output */
export interface LogEntry {
  timestamp: string;
  level: string;
  correlationId: string;
  method: string;
  path: string;
  status?: number;
  duration?: number;
  userId?: string;
  message: string;
}

/** Current minimum log level — messages below this are suppressed */
let currentLevel: LogLevel = LogLevel.Info;

/**
 * Sets the minimum log level for the gateway.
 * @param level - The log level string (debug, info, warn, error)
 */
export function setLogLevel(level: string): void {
  const map: Record<string, LogLevel> = {
    debug: LogLevel.Debug,
    info: LogLevel.Info,
    warn: LogLevel.Warn,
    error: LogLevel.Error,
  };
  currentLevel = map[level.toLowerCase()] ?? LogLevel.Info;
}

/**
 * Generates a unique correlation ID for request tracing.
 * Uses the incoming X-Correlation-ID header if present, otherwise generates one.
 * @param headers - Request headers
 * @returns A correlation ID string
 */
export function getCorrelationId(headers: Record<string, string>): string {
  return headers['x-correlation-id'] ?? headers['x-request-id'] ?? generateToken(8);
}

/**
 * Logs an incoming request at Info level.
 * @param request - The gateway request to log
 */
export function logRequest(request: GatewayRequest): void {
  if (currentLevel > LogLevel.Info) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: 'INFO',
    correlationId: request.correlationId,
    method: request.method,
    path: request.path,
    userId: request.auth?.sub,
    message: `→ ${request.method} ${request.path}`,
  };

  writeLog(entry);
}

/**
 * Logs an outgoing response with timing information.
 * Uses Warn level for 4xx and Error level for 5xx responses.
 * @param request - The original gateway request
 * @param response - The gateway response being sent
 */
export function logResponse(request: GatewayRequest, response: GatewayResponse): void {
  const level = response.status >= 500 ? 'ERROR' : response.status >= 400 ? 'WARN' : 'INFO';
  const numericLevel = response.status >= 500 ? LogLevel.Error : response.status >= 400 ? LogLevel.Warn : LogLevel.Info;

  if (currentLevel > numericLevel) return;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    correlationId: request.correlationId,
    method: request.method,
    path: request.path,
    status: response.status,
    duration: response.duration,
    userId: request.auth?.sub,
    message: `← ${response.status} ${request.method} ${request.path} (${response.duration}ms)`,
  };

  writeLog(entry);
}

/**
 * Writes a structured log entry to stdout as JSON.
 * In production, these would be consumed by a log aggregator (e.g., Datadog, ELK).
 */
function writeLog(entry: LogEntry): void {
  process.stdout.write(JSON.stringify(entry) + '\n');
}
