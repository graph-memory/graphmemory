import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Card, CardContent, TextField, Button, Typography, Alert,
  CircularProgress, Divider,
} from '@mui/material';

type Stage = 'checking' | 'login' | 'consent' | 'connecting' | 'error';

export default function AuthorizePage() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get('client_id') || '';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const responseType = searchParams.get('response_type') || '';
  const codeChallenge = searchParams.get('code_challenge') || '';
  const codeChallengeMethod = searchParams.get('code_challenge_method') || '';
  const state = searchParams.get('state') || '';

  const hostname = (() => {
    try { return new URL(redirectUri).hostname; } catch { return redirectUri; }
  })();

  const [stage, setStage] = useState<Stage>('checking');
  const [error, setError] = useState('');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' });
      if (!res.ok) { setStage('login'); return; }
      const data = await res.json();
      if (data.authenticated) {
        setStage('consent');
      } else {
        setStage('login');
      }
    } catch {
      setStage('login');
    }
  }, []);

  useEffect(() => {
    if (!clientId || !redirectUri || responseType !== 'code' || !codeChallenge || codeChallengeMethod !== 'S256') {
      setError('Invalid OAuth parameters');
      setStage('error');
      return;
    }
    checkSession();
  }, [clientId, redirectUri, responseType, codeChallenge, codeChallengeMethod, checkSession]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        setStage('consent');
      } else {
        const body = await res.json().catch(() => ({ error: 'Login failed' }));
        setLoginError(body.error || 'Login failed');
      }
    } catch {
      setLoginError('Connection failed');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleConsent = async () => {
    setStage('connecting');
    setError('');
    try {
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          response_type: responseType,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          state: state || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error_description: 'Authorization failed' }));
        if (body.error === 'login_required') {
          setStage('login');
          return;
        }
        setError(body.error_description || body.error || 'Authorization failed');
        setStage('error');
        return;
      }
      const data = await res.json();
      window.location.href = data.redirectUrl;
    } catch {
      setError('Connection failed');
      setStage('error');
    }
  };

  if (stage === 'checking') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (stage === 'connecting') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 2 }}>
        <CircularProgress />
        <Typography color="text.secondary">Connecting...</Typography>
      </Box>
    );
  }

  if (stage === 'error') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
          <CardContent>
            <Typography variant="h5" gutterBottom align="center">Authorization Error</Typography>
            <Alert severity="error">{error}</Alert>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom align="center">Graph Memory</Typography>

          {stage === 'login' && (
            <>
              <Typography variant="body2" color="text.secondary" gutterBottom align="center">
                Sign in to connect <strong>{hostname}</strong>
              </Typography>
              <form onSubmit={handleLogin}>
                <TextField
                  fullWidth label="Email" type="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  margin="normal" autoFocus
                />
                <TextField
                  fullWidth label="Password" type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  margin="normal"
                />
                {loginError && <Alert severity="error" sx={{ mt: 1 }}>{loginError}</Alert>}
                <Button fullWidth variant="contained" type="submit"
                  disabled={loginLoading || !email.trim() || !password} sx={{ mt: 2 }}>
                  {loginLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </>
          )}

          {stage === 'consent' && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body1" align="center" sx={{ mb: 2 }}>
                Connect <strong>{hostname}</strong> to your Graph Memory account?
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
                This will allow {hostname} to access your graph memory data.
              </Typography>
              <Button fullWidth variant="contained" onClick={handleConsent} sx={{ mb: 1 }}>
                Connect
              </Button>
              <Button fullWidth variant="outlined" onClick={() => window.history.back()}>
                Cancel
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
