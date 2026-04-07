import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Alert } from '@mui/material';
import { createTask, uploadTaskAttachment, type TaskStatus, type TaskPriority } from '@/entities/task/index.ts';
import { linkTaskToEpic } from '@/entities/epic/index.ts';
import { TaskForm } from '@/features/task-crud/TaskForm.tsx';
import { StagedAttachments } from '@/features/attachments/index.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, Section } from '@/shared/ui/index.ts';

export default function TaskNewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('tasks');
  const [searchParams] = useSearchParams();
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const assigneeIdParam = searchParams.get('assigneeId');
  const defaults = {
    title: searchParams.get('title') || undefined,
    status: (searchParams.get('status') as TaskStatus) || undefined,
    priority: (searchParams.get('priority') as TaskPriority) || undefined,
    assigneeId: assigneeIdParam ? Number(assigneeIdParam) : undefined,
    tags: searchParams.get('tags')?.split(',').filter(Boolean) || undefined,
  };
  const epicId = searchParams.get('epicId') || undefined;

  const handleSubmit = async (data: Parameters<typeof createTask>[1]) => {
    if (!projectId) return;
    const task = await createTask(projectId, data);
    if (epicId) {
      await linkTaskToEpic(projectId, epicId, task.id).catch(e => console.error('Failed to link task to epic', e));
    }
    for (const file of stagedFiles) {
      await uploadTaskAttachment(projectId, task.id, file).catch(e => console.error('Failed to upload attachment', e));
    }
    navigate(`/${projectId}/tasks/${task.id}`);
    return task;
  };

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Tasks', to: `/${projectId}/tasks` },
          ...(() => {
            const from = searchParams.get('from');
            if (from === 'board') return [{ label: 'Board', to: `/${projectId}/tasks/board` }];
            if (from === 'list') return [{ label: 'List', to: `/${projectId}/tasks/list` }];
            return [];
          })(),
          { label: 'Create' },
        ]}
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot create tasks.</Alert>}
      <TaskForm
        defaults={defaults}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/tasks`)}
        submitLabel="Create"
        extraMain={
          <Section title="Attachments" sx={{ mt: 3 }}>
            <StagedAttachments
              files={stagedFiles}
              onAdd={files => setStagedFiles(prev => [...prev, ...files])}
              onRemove={index => setStagedFiles(prev => prev.filter((_, i) => i !== index))}
            />
          </Section>
        }
      />
    </Box>
  );
}
