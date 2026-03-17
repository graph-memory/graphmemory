/** Admin API base URL — configured via environment variable */
const BASE_URL = process.env.REACT_APP_API_URL ?? '/api/admin';

interface RequestInterceptor {
  onRequest: (config: RequestInit, url: string) => RequestInit;
}

interface ResponseError {
  status: number;
  message: string;
  code?: string;
}

class ApiClientError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

/** Centralized admin API client with auth headers, error handling, and interceptors */
class ApiClient {
  private interceptors: RequestInterceptor[] = [];
  private authToken: string | null = null;

  setAuthToken(token: string | null) {
    this.authToken = token;
  }

  addInterceptor(interceptor: RequestInterceptor) {
    this.interceptors.push(interceptor);
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${BASE_URL}${path}`;
    let config: RequestInit = {
      method,
      headers: this.buildHeaders(),
      credentials: 'include',
    };
    if (body !== undefined) {
      config.body = JSON.stringify(body);
    }
    for (const interceptor of this.interceptors) {
      config = interceptor.onRequest(config, url);
    }
    const response = await fetch(url, config);
    if (!response.ok) {
      let errorData: ResponseError;
      try {
        errorData = await response.json();
      } catch {
        errorData = { status: response.status, message: response.statusText };
      }
      if (response.status === 401) {
        this.authToken = null;
        window.dispatchEvent(new CustomEvent('auth:expired'));
      }
      throw new ApiClientError(errorData.status, errorData.message, errorData.code);
    }
    if (response.status === 204) return undefined as T;
    return response.json();
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete(path: string): Promise<void> {
    return this.request<void>('DELETE', path);
  }
}

export const apiClient = new ApiClient();
export { ApiClientError };
export type { ResponseError };
