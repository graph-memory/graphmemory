const BASE = '/api';

let _onAuthFailure: (() => void) | null = null;

/** Register a callback for when auth fails (refresh exhausted). Called by AuthGate. */
export function onAuthFailure(cb: () => void) { _onAuthFailure = cb; }

/** Trigger the registered auth failure handler (used by WebSocket reconnect). */
export function triggerAuthFailure(): void {
  if (_onAuthFailure) _onAuthFailure();
}

let _refreshPromise: Promise<boolean> | null = null;

export async function tryRefresh(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(res => res.ok)
    .catch(() => false)
    .finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...init?.headers as any };
  const doFetch = () => fetch(`${BASE}${path}`, { ...init, headers, credentials: 'include' });

  let res = await doFetch();

  // On 401, try refresh once then retry
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    } else {
      if (_onAuthFailure) {
        _onAuthFailure();
      } else {
        window.location.href = `/ui/auth/signin?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      }
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Like request(), but for FormData uploads (no Content-Type — browser sets multipart boundary). */
export async function requestUpload<T>(path: string, body: FormData, init?: RequestInit): Promise<T> {
  const doFetch = () => fetch(`${BASE}${path}`, { method: 'POST', ...init, body, credentials: 'include' });

  let res = await doFetch();

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    } else {
      if (_onAuthFailure) {
        _onAuthFailure();
      } else {
        window.location.href = `/ui/auth/signin?returnUrl=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      }
      throw new Error('Session expired');
    }
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || res.statusText);
  }
  return res.json();
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
}

export interface ListResponse<T> {
  results: T[];
}

export interface PaginatedResponse<T> {
  results: T[];
  total: number;
}

export function unwrapList<T>(data: ListResponse<T>): T[] {
  return data.results;
}

export function unwrapPaginated<T>(data: PaginatedResponse<T>): { items: T[]; total: number } {
  return { items: data.results, total: data.total };
}
