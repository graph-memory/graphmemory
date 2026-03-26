import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthFailure } from '@/shared/api/client.ts';
import { onWsAuthFailure } from '@/shared/lib/useWebSocket.ts';
import { checkAuthStatus } from '@/entities/project/api.ts';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'login'>('loading');
  const location = useLocation();

  // Auth pages are accessible without authentication
  const isAuthPage = location.pathname.startsWith('/auth/');

  const check = useCallback(async () => {
    try {
      const status = await checkAuthStatus();
      if (!status.required || status.authenticated) {
        setState('ok');
      } else {
        setState('login');
      }
    } catch {
      // Can't reach server — require login rather than exposing full UI
      setState('login');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Register auth failure handlers — when refresh token expires, redirect to login
  useEffect(() => {
    onAuthFailure(() => setState('login'));
    onWsAuthFailure(() => setState('login'));
  }, []);

  // Always render auth pages directly, bypassing the gate
  if (isAuthPage) return <>{children}</>;

  if (state === 'loading') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (state === 'login') {
    // Only include returnUrl when user was on a meaningful page (session expired mid-use).
    // For root/initial visits, no returnUrl needed — signin defaults to '/'.
    const isRoot = location.pathname === '/' && !location.search;
    if (isRoot) {
      return <Navigate to="/auth/signin" replace />;
    }
    const returnUrl = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth/signin?returnUrl=${encodeURIComponent(returnUrl)}`} replace />;
  }

  return <>{children}</>;
}
