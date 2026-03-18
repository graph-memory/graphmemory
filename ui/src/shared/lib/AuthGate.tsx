import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { onAuthFailure } from '@/shared/api/client.ts';
import { checkAuthStatus } from '@/entities/project/api.ts';
import LoginPage from '@/pages/login/index.tsx';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'loading' | 'ok' | 'login'>('loading');

  const check = useCallback(async () => {
    try {
      const status = await checkAuthStatus();
      if (!status.required || status.authenticated) {
        setState('ok');
      } else {
        setState('login');
      }
    } catch {
      // Can't reach server — show app anyway, errors will surface naturally
      setState('ok');
    }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Register auth failure handler — when refresh token expires, show login
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
    return <LoginPage onSuccess={() => setState('ok')} />;
  }

  return <>{children}</>;
}
