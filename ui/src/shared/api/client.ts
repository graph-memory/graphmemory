const BASE = '/api';

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
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

export function unwrapList<T>(data: ListResponse<T>): T[] {
  return data.results;
}
