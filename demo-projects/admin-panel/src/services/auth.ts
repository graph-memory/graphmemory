import { AdminUser, AdminRole } from '@/types';
import { apiClient } from './api-client';

interface AuthSession {
  user: AdminUser;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

const SESSION_KEY = 'shopflow_admin_session';
const ALLOWED_ROLES: AdminRole[] = ['admin', 'manager', 'support'];

/** Admin authentication service — requires admin/manager/support role with optional 2FA */
export class AuthService {
  private session: AuthSession | null = null;

  constructor() {
    this.restoreSession();
  }

  private restoreSession() {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return;
      const parsed: AuthSession = JSON.parse(stored);
      if (parsed.expiresAt < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      this.session = parsed;
      apiClient.setAuthToken(parsed.accessToken);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }

  async login(credentials: LoginCredentials): Promise<AuthSession> {
    const response = await apiClient.post<AuthSession>('/auth/login', credentials);

    if (!ALLOWED_ROLES.includes(response.user.role)) {
      throw new Error(`Access denied: role "${response.user.role}" is not permitted for admin panel`);
    }

    this.session = response;
    apiClient.setAuthToken(response.accessToken);
    localStorage.setItem(SESSION_KEY, JSON.stringify(response));
    return response;
  }

  async verify2FA(code: string): Promise<boolean> {
    const result = await apiClient.post<{ verified: boolean }>('/auth/verify-2fa', { code });
    return result.verified;
  }

  async refreshSession(): Promise<void> {
    if (!this.session?.refreshToken) throw new Error('No session to refresh');
    const response = await apiClient.post<AuthSession>('/auth/refresh', {
      refreshToken: this.session.refreshToken,
    });
    this.session = response;
    apiClient.setAuthToken(response.accessToken);
    localStorage.setItem(SESSION_KEY, JSON.stringify(response));
  }

  logout() {
    this.session = null;
    apiClient.setAuthToken(null);
    localStorage.removeItem(SESSION_KEY);
    apiClient.post('/auth/logout').catch(() => {});
  }

  getUser(): AdminUser | null {
    return this.session?.user ?? null;
  }

  isAuthenticated(): boolean {
    return this.session !== null && this.session.expiresAt > Date.now();
  }

  hasRole(role: AdminRole): boolean {
    return this.session?.user.role === role;
  }

  canAccess(requiredRoles: AdminRole[]): boolean {
    if (!this.session) return false;
    return requiredRoles.includes(this.session.user.role);
  }
}

export const authService = new AuthService();
