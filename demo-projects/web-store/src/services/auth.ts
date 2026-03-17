/**
 * Authentication service for the ShopFlow Web Store.
 *
 * Manages JWT tokens in localStorage, provides automatic token refresh
 * before expiry, and notifies subscribers of auth state changes.
 * Works alongside the useAuth hook for React integration.
 * @module services/auth
 */

const ACCESS_TOKEN_KEY = 'shopflow_access_token';
const REFRESH_TOKEN_KEY = 'shopflow_refresh_token';
const TOKEN_EXPIRY_KEY = 'shopflow_token_expiry';
const REFRESH_MARGIN_MS = 60_000;

type AuthStateListener = (isAuthenticated: boolean) => void;

const listeners = new Set<AuthStateListener>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/** Retrieve the current access token from storage, or null if absent */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Retrieve the current refresh token from storage */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Check whether the current access token has expired */
export function isTokenExpired(): boolean {
  const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!expiry) return true;
  return Date.now() >= parseInt(expiry, 10);
}

/**
 * Store a new token pair and schedule automatic refresh.
 * Notifies all auth state listeners that the user is authenticated.
 */
export function setTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  const expiryMs = Date.now() + expiresIn * 1000;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(TOKEN_EXPIRY_KEY, expiryMs.toString());
  scheduleRefresh(expiresIn * 1000);
  notifyListeners(true);
}

/** Clear all stored tokens and cancel any pending refresh timer */
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRY_KEY);
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  notifyListeners(false);
}

/**
 * Schedule a token refresh to run before the access token expires.
 * Subtracts a margin to ensure the refresh completes in time.
 */
function scheduleRefresh(expiresInMs: number): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(expiresInMs - REFRESH_MARGIN_MS, 0);
  refreshTimer = setTimeout(refreshAccessToken, delay);
}

/**
 * Perform the token refresh by calling the auth API.
 * On failure, clears tokens and forces re-authentication.
 */
async function refreshAccessToken(): Promise<void> {
  const currentRefresh = getRefreshToken();
  if (!currentRefresh) {
    clearTokens();
    return;
  }
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: currentRefresh }),
    });
    if (!response.ok) {
      clearTokens();
      return;
    }
    const data = await response.json();
    setTokens(data.accessToken, data.refreshToken, data.expiresIn);
  } catch {
    clearTokens();
  }
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthStateChange(listener: AuthStateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Notify all registered listeners of the current auth state */
function notifyListeners(isAuthenticated: boolean): void {
  listeners.forEach((listener) => listener(isAuthenticated));
}

/** Initialize auth on app startup: check token validity and schedule refresh */
export function initAuth(): void {
  const token = getAccessToken();
  if (!token) return;
  if (isTokenExpired()) {
    refreshAccessToken();
  } else {
    const expiry = parseInt(localStorage.getItem(TOKEN_EXPIRY_KEY) ?? '0', 10);
    scheduleRefresh(expiry - Date.now());
    notifyListeners(true);
  }
}
