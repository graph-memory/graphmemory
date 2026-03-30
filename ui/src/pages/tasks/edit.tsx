import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Alert } from '@mui/material';
import { getTask, updateTask, listTaskAttachments, uploadTaskAttachment, deleteTaskAttachment, taskAttachmentUrl, type Task, type AttachmentMeta } from '@/entities/task/index.ts';
import { TaskForm } from '@/features/task-crud/TaskForm.tsx';
import { AttachmentSection } from '@/features/attachments/index.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, Section } from '@/shared/ui/index.ts';

export default function TaskEditPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from');
  const canWrite = useCanWrite('tasks');
  const [task, setTask] = useState<Task | null>(null);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttachments = useCallback(async () => {
    if (!projectId || !taskId) return;
    const atts = await listTaskAttachments(projectId, taskId).catch(() => []);
    setAttachments(atts);
  }, [projectId, taskId]);

  useEffect(() => {
    if (!projectId || !taskId) return;
    Promise.all([
      getTask(projectId, taskId).then(setTask),
      loadAttachments(),
    ])
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, taskId, loadAttachments]);

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
          ...(from === 'board' ? [{ label: 'Board', to: `/${projectId}/tasks/board` }] :
              from === 'list' ? [{ label: 'List', to: `/${projectId}/tasks/list` }] : []),
          { label: task.title, to: `/${projectId}/tasks/${taskId}${from ? `?from=${from}` : ''}` },
          { label: 'Edit' },
        ]}
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot edit tasks.</Alert>}
      <TaskForm
        task={task}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/tasks/${taskId}`)}
        extraMain={
          <Section title="Attachments" sx={{ mt: 3 }}>
            <AttachmentSection
              attachments={attachments}
              getUrl={(filename) => taskAttachmentUrl(projectId!, taskId!, filename)}
              onUpload={async (file) => {
                await uploadTaskAttachment(projectId!, taskId!, file);
                await loadAttachments();
              }}
              onDelete={async (filename) => {
                await deleteTaskAttachment(projectId!, taskId!, filename);
                await loadAttachments();
              }}
              readOnly={!canWrite}
            />
          </Section>
        }
      />
    </Box>
  );
}
