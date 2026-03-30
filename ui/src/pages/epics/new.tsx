import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Alert } from '@mui/material';
import { createEpic } from '@/entities/epic/index.ts';
import { EpicForm } from '@/features/epic-crud/EpicForm.tsx';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function EpicNewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('tasks');

  const handleSubmit = async (data: Parameters<typeof createEpic>[1]) => {
    if (!projectId) return;
    const epic = await createEpic(projectId, data);
    navigate(`/${projectId}/tasks/epics/${epic.id}`);
  };

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Epics', to: `/${projectId}/tasks/epics` },
          { label: 'Create' },
        ]}
        actions={
          <Button variant="contained" form="epic-form" type="submit" disabled={!canWrite}>
            Create
          </Button>
        }
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access.</Alert>}
      <EpicForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/tasks/epics`)}
        submitLabel="Create"
      />
    </Box>
  );
}
