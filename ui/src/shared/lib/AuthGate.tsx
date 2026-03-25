import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthFailure } from '@/shared/api/client.ts';
import { checkAuthStatus } from '@/entities/project/api.ts';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'login'>('loading');
  const location = useLocation();

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

  // Register auth failure handler — when refresh token expires, redirect to login
  useEffect(() => {
    onAuthFailure(() => setState('login'));
  }, []);

  if (state === 'loading') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (state === 'login') {
    const returnUrl = `${location.pathname}${location.search}`;
    return <Navigate to={`/auth/signin?returnUrl=${encodeURIComponent(returnUrl)}`} replace />;
  }

  return <>{children}</>;
}
