import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Card, CardContent, TextField, Button, Typography, Alert } from '@mui/material';

export default function SignInPage() {
  const [searchParams] = useSearchParams();
  // Only allow relative paths to prevent open redirect attacks
  const rawReturn = searchParams.get('returnUrl') || '/';
  const returnUrl = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        // Full page reload so AuthGate re-checks auth from scratch
        window.location.href = '/ui' + returnUrl;
        return;
      } else {
        const body = await res.json().catch(() => ({ error: 'Login failed' }));
        setError(body.error || 'Login failed');
      }
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Card sx={{ maxWidth: 400, width: '100%', mx: 2 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom align="center">Graph Memory</Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom align="center">
            Sign in to continue
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              margin="normal"
              autoFocus
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              margin="normal"
            />
            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
            <Button fullWidth variant="contained" type="submit" disabled={loading || !email.trim() || !password} sx={{ mt: 2 }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
