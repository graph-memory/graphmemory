import { useState } from 'react';
import { Box, Card, CardContent, TextField, Button, Typography, Alert } from '@mui/material';
import { setApiKey } from '@/shared/api/client.ts';
import { checkAuthStatus } from '@/entities/project/api.ts';

interface LoginPageProps {
  onSuccess: () => void;
}

export default function LoginPage({ onSuccess }: LoginPageProps) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError('');
    try {
      setApiKey(key.trim());
      const status = await checkAuthStatus();
      if (status.authenticated) {
        localStorage.setItem('apiKey', key.trim());
        onSuccess();
      } else {
        setApiKey(null);
        setError('Invalid API key');
      }
    } catch {
      setApiKey(null);
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
            Enter your API key to continue
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="API Key"
              type="password"
              value={key}
              onChange={e => setKey(e.target.value)}
              margin="normal"
              autoFocus
            />
            {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
            <Button fullWidth variant="contained" type="submit" disabled={loading || !key.trim()} sx={{ mt: 2 }}>
              {loading ? 'Checking...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
