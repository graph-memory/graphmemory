import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Alert } from '@mui/material';
import { getTask, updateTask, type Task } from '@/entities/task/index.ts';
import { TaskForm } from '@/features/task-crud/TaskForm.tsx';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function TaskEditPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('tasks');
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !taskId) return;
    getTask(projectId, taskId)
      .then(setTask)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, taskId]);

  const handleSubmit = async (data: Parameters<typeof updateTask>[2]) => {
    if (!projectId || !taskId) return;
    await updateTask(projectId, taskId, data);
    navigate(`/${projectId}/tasks/${taskId}`);
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  if (error || !task) {
    return <Alert severity="error">{error || 'Task not found'}</Alert>;
  }

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Tasks', to: `/${projectId}/tasks` },
          { label: task.title, to: `/${projectId}/tasks/${taskId}` },
          { label: 'Edit' },
        ]}
        actions={
          <Button variant="contained" form="task-form" type="submit" disabled={!canWrite}>
            Save
          </Button>
        }
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot edit tasks.</Alert>}
      <TaskForm
        task={task}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/tasks/${taskId}`)}
      />
    </Box>
  );
}
