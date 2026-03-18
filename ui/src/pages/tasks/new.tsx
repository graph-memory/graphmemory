import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Alert } from '@mui/material';
import { createTask } from '@/entities/task/index.ts';
import { TaskForm } from '@/features/task-crud/TaskForm.tsx';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function TaskNewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('tasks');

  const handleSubmit = async (data: Parameters<typeof createTask>[1]) => {
    if (!projectId) return;
    const task = await createTask(projectId, data);
    navigate(`/${projectId}/tasks/${task.id}`);
  };

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Tasks', to: `/${projectId}/tasks` },
          { label: 'Create' },
        ]}
        actions={
          <Button variant="contained" form="task-form" type="submit" disabled={!canWrite}>
            Create
          </Button>
        }
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot create tasks.</Alert>}
      <TaskForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/tasks`)}
        submitLabel="Create"
      />
    </Box>
  );
}
