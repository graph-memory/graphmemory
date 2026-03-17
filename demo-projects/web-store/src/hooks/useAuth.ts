/**
 * Authentication hook for the ShopFlow Web Store.
 *
 * Wraps the auth service to provide React-friendly login, logout,
 * and registration functions with loading/error states. Subscribes
 * to auth state changes so components re-render on token events.
 * @module hooks/useAuth
 */

import { useState, useEffect, useCallback } from 'react';
import type { User } from '@/types';
import { post, get } from '@/services/api-client';
import { setTokens, clearTokens, getAccessToken, onAuthStateChange, initAuth } from '@/services/auth';

/** Credentials payload for login requests */
interface LoginCredentials {
  email: string;
  password: string;
}

/** Registration payload for new user signup */
interface RegisterPayload extends LoginCredentials {
  firstName: string;
  lastName: string;
}

/** Token response from the auth API */
interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

/** Return type for the useAuth hook */
export interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

/**
 * Hook managing authentication state, login, logout, and registration.
 * Initializes auth on mount and subscribes to token change events.
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initAuth();
    const unsubscribe = onAuthStateChange((authenticated) => {
      setIsAuthenticated(authenticated);
      if (!authenticated) setUser(null);
    });
    if (getAccessToken()) {
      get<User>('/auth/me')
        .then(setUser)
        .catch(() => clearTokens());
    }
    return unsubscribe;
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await post<AuthResponse>('/auth/login', credentials);
      setTokens(data.accessToken, data.refreshToken, data.expiresIn);
      setUser(data.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await post<AuthResponse>('/auth/register', payload);
      setTokens(data.accessToken, data.refreshToken, data.expiresIn);
      setUser(data.user);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { user, isAuthenticated, isLoading, error, login, register, logout, clearError };
}
