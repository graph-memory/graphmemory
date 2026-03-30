import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Alert } from '@mui/material';
import { getEpic, updateEpic, type Epic } from '@/entities/epic/index.ts';
import { EpicForm } from '@/features/epic-crud/EpicForm.tsx';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function EpicEditPage() {
  const { projectId, epicId } = useParams<{ projectId: string; epicId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('tasks');
  const [epic, setEpic] = useState<Epic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !epicId) return;
    getEpic(projectId, epicId)
      .then(setEpic)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, epicId]);

  const handleSubmit = async (data: Parameters<typeof updateEpic>[2]) => {
    if (!projectId || !epicId) return;
    await updateEpic(projectId, epicId, data);
    navigate(`/${projectId}/tasks/epics/${epicId}`);
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (error || !epic) return <Alert severity="error">{error || 'Epic not found'}</Alert>;

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Epics', to: `/${projectId}/tasks/epics` },
          { label: epic.title, to: `/${projectId}/tasks/epics/${epicId}` },
          { label: 'Edit' },
        ]}
        actions={
          <Button variant="contained" form="epic-form" type="submit" disabled={!canWrite}>Save</Button>
        }
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access.</Alert>}
      <EpicForm
        epic={epic}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/tasks/epics/${epicId}`)}
      />
    </Box>
  );
}
