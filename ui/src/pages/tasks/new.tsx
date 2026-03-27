import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Button, Alert } from '@mui/material';
import { createTask, type TaskStatus, type TaskPriority } from '@/entities/task/index.ts';
import { linkTaskToEpic } from '@/entities/epic/index.ts';
import { TaskForm } from '@/features/task-crud/TaskForm.tsx';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function TaskNewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('tasks');
  const [searchParams] = useSearchParams();

  const defaults = {
    title: searchParams.get('title') || undefined,
    status: (searchParams.get('status') as TaskStatus) || undefined,
    priority: (searchParams.get('priority') as TaskPriority) || undefined,
    assignee: searchParams.get('assignee') || undefined,
    tags: searchParams.get('tags')?.split(',').filter(Boolean) || undefined,
  };
  const epicId = searchParams.get('epicId') || undefined;

  const handleSubmit = async (data: Parameters<typeof createTask>[1]) => {
    if (!projectId) return;
    const task = await createTask(projectId, data);
    if (epicId) {
      await linkTaskToEpic(projectId, epicId, task.id).catch(() => {});
    }
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
        defaults={defaults}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/tasks`)}
        submitLabel="Create"
      />
    </Box>
  );
}
