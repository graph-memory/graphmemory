import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import { createTask } from '@/entities/task/index.ts';
import { TaskForm } from '@/features/task-crud/TaskForm.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function TaskNewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

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
          <Button variant="contained" form="task-form" type="submit">
            Create
          </Button>
        }
      />
      <TaskForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/tasks`)}
        submitLabel="Create"
      />
    </Box>
  );
}
