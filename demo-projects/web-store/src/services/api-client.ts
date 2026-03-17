/**
 * HTTP client wrapper for the ShopFlow API.
 *
 * Provides typed request methods with automatic auth header injection,
 * exponential backoff retry, and consistent error handling.
 * All API calls flow through this client to ensure uniform behavior.
 * @module services/api-client
 */

import { getAccessToken } from '@/services/auth';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://api.shopflow.dev';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

/** Structured API error with status code and optional validation details */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Build the default headers for an API request.
 * Injects the Bearer token when the user is authenticated.
 */
function buildHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...extraHeaders,
  };
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Sleep helper for retry backoff. Doubles the delay on each attempt.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core fetch wrapper with retry logic and error normalization.
 * Retries on 5xx errors and network failures up to MAX_RETRIES times.
 */
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 204) {
        return undefined as T;
      }
      const body = await response.json();
      if (!response.ok) {
        const apiError = new ApiError(
          response.status,
          body.code ?? 'UNKNOWN_ERROR',
          body.message ?? response.statusText,
          body.details
        );
        if (response.status >= 500 && attempt < retries) {
          lastError = apiError;
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
          continue;
        }
        throw apiError;
      }
      return body as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastError = error as Error;
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

/** Perform a GET request to the given API path */
export function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return fetchWithRetry<T>(url.toString(), { method: 'GET', headers: buildHeaders() });
}

/** Perform a POST request with a JSON body */
export function post<T>(path: string, body: unknown): Promise<T> {
  return fetchWithRetry<T>(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
}

/** Perform a PUT request with a JSON body */
export function put<T>(path: string, body: unknown): Promise<T> {
  return fetchWithRetry<T>(`${BASE_URL}${path}`, {
    method: 'PUT',
    headers: buildHeaders(),
    body: JSON.stringify(body),
  });
}

/** Perform a DELETE request to the given API path */
export function del<T = void>(path: string): Promise<T> {
  return fetchWithRetry<T>(`${BASE_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
}
