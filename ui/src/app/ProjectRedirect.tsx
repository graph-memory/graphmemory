import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { listProjects } from '@/entities/project/api.ts';

export default function ProjectRedirect() {
  const [firstId, setFirstId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProjects()
      .then((projects) => {
        if (projects.length > 0) {
          setFirstId(projects[0].id);  // redirects to /{id}/dashboard
        } else {
          setError('No projects configured. Add a project to graph-memory.yaml and restart the server.');
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  if (firstId) {
    return <Navigate to={`/${firstId}/dashboard`} replace />;
  }

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <CircularProgress />
    </Box>
  );
}
