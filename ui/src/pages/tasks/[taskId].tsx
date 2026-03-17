import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, CircularProgress, Link,
  FormControl, InputLabel, Select, MenuItem, Stack,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  getTask, deleteTask, moveTask, listTaskRelations,
  listTaskAttachments, uploadTaskAttachment, deleteTaskAttachment, taskAttachmentUrl,
  type Task, type TaskStatus, type TaskRelation, type AttachmentMeta,
  COLUMNS, STATUS_BADGE_COLOR, PRIORITY_BADGE_COLOR, statusLabel, priorityLabel,
} from '@/entities/task/index.ts';
import { RelationManager } from '@/features/relation-manager/index.ts';
import { AttachmentSection } from '@/features/attachments/index.ts';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import {
  PageTopBar, Section, FieldRow, StatusBadge, Tags, CopyButton, DateDisplay, ConfirmDialog, MarkdownRenderer,
} from '@/shared/ui/index.ts';

interface TaskDetail extends Task {
  subtasks?: Array<{ id: string; title: string; status: TaskStatus }>;
  blockedBy?: Array<{ id: string; title: string; status: TaskStatus }>;
  blocks?: Array<{ id: string; title: string; status: TaskStatus }>;
  related?: Array<{ id: string; title: string; status: TaskStatus }>;
}

export default function TaskDetailPage() {
  const { projectId, taskId } = useParams<{ projectId: string; taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [relations, setRelations] = useState<TaskRelation[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !taskId) return;
    try {
      const [t, rels, atts] = await Promise.all([
        getTask(projectId, taskId) as Promise<TaskDetail>,
        listTaskRelations(projectId, taskId),
        listTaskAttachments(projectId, taskId),
      ]);
      setTask(t);
      setRelations(rels);
      setAttachments(atts);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  useEffect(() => { load(); }, [load]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('task:')) load();
  }, [load]));

  const handleDelete = async () => {
    if (!projectId || !taskId) return;
    await deleteTask(projectId, taskId);
    navigate(`/${projectId}/tasks`);
  };

  const handleMove = async (status: TaskStatus) => {
    if (!projectId || !taskId) return;
    await moveTask(projectId, taskId, status);
    load();
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  if (error || !task) {
    return <Alert severity="error">{error || 'Task not found'}</Alert>;
  }

  const renderTaskLinks = (label: string, items?: Array<{ id: string; title: string; status: TaskStatus }>) => {
    if (!items || items.length === 0) return null;
    return (
      <FieldRow label={label}>
        <Stack spacing={0.5}>
          {items.map(item => (
            <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <StatusBadge label={statusLabel(item.status)} color={STATUS_BADGE_COLOR[item.status]} size="small" />
              <Link component="button" variant="body2" onClick={() => navigate(`/${projectId}/tasks/${item.id}`)}>
                {item.title}
              </Link>
            </Box>
          ))}
        </Stack>
      </FieldRow>
    );
  };

  const hasDeps = !!(task.subtasks?.length || task.blockedBy?.length || task.blocks?.length || task.related?.length);

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Tasks', to: `/${projectId}/tasks` },
          { label: task.title },
        ]}
        actions={
          <>
            <Button variant="contained" color="success" startIcon={<EditIcon />} onClick={() => navigate(`/${projectId}/tasks/${taskId}/edit`)}>
              Edit
            </Button>
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteConfirm(true)}>
              Delete
            </Button>
          </>
        }
      />

      <Section title="Properties" sx={{ mb: 3 }}>
        <FieldRow label="ID">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{task.id}</Typography>
            <CopyButton value={task.id} />
          </Box>
        </FieldRow>
        <FieldRow label="Version">
          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>v{task.version}</Typography>
        </FieldRow>
        <FieldRow label="Status">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StatusBadge label={statusLabel(task.status)} color={STATUS_BADGE_COLOR[task.status]} />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Move to</InputLabel>
              <Select value="" label="Move to" onChange={e => handleMove(e.target.value as TaskStatus)}>
                {COLUMNS.filter(c => c.status !== task.status).map(c => (
                  <MenuItem key={c.status} value={c.status}>{c.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </FieldRow>
        <FieldRow label="Priority">
          <StatusBadge label={priorityLabel(task.priority)} color={PRIORITY_BADGE_COLOR[task.priority]} />
        </FieldRow>
        <FieldRow label="Tags">
          {task.tags.length > 0 ? <Tags tags={task.tags} /> : <Typography variant="body2" color="text.secondary">—</Typography>}
        </FieldRow>
        {task.dueDate != null && (
          <FieldRow label="Due Date">
            <DateDisplay value={task.dueDate} showRelative />
          </FieldRow>
        )}
        {task.estimate != null && (
          <FieldRow label="Estimate">
            <Typography variant="body2">{task.estimate}h</Typography>
          </FieldRow>
        )}
        {task.completedAt != null && (
          <FieldRow label="Completed">
            <DateDisplay value={task.completedAt} showTime showRelative />
          </FieldRow>
        )}
        {task.createdBy && (
          <FieldRow label="Created by">
            <Typography variant="body2">{task.createdBy}</Typography>
          </FieldRow>
        )}
        {task.updatedBy && task.updatedBy !== task.createdBy && (
          <FieldRow label="Updated by">
            <Typography variant="body2">{task.updatedBy}</Typography>
          </FieldRow>
        )}
        <FieldRow label="Created">
          <DateDisplay value={task.createdAt} showTime showRelative />
        </FieldRow>
        <FieldRow label="Updated" divider={false}>
          <DateDisplay value={task.updatedAt} showTime showRelative />
        </FieldRow>
      </Section>

      {task.description && (
        <Section title="Description" sx={{ mb: 3 }}>
          <MarkdownRenderer>{task.description}</MarkdownRenderer>
        </Section>
      )}

      {hasDeps && (
        <Section title="Dependencies" sx={{ mb: 3 }}>
          {renderTaskLinks('Subtasks', task.subtasks)}
          {renderTaskLinks('Blocked by', task.blockedBy)}
          {renderTaskLinks('Blocks', task.blocks)}
          {renderTaskLinks('Related', task.related)}
        </Section>
      )}

      <Section title="Attachments" sx={{ mb: 3 }}>
        <AttachmentSection
          attachments={attachments}
          getUrl={(filename) => taskAttachmentUrl(projectId!, taskId!, filename)}
          onUpload={async (file) => {
            await uploadTaskAttachment(projectId!, taskId!, file);
            const atts = await listTaskAttachments(projectId!, taskId!);
            setAttachments(atts);
          }}
          onDelete={async (filename) => {
            await deleteTaskAttachment(projectId!, taskId!, filename);
            const atts = await listTaskAttachments(projectId!, taskId!);
            setAttachments(atts);
          }}
        />
      </Section>

      <Section title="Cross-graph Links">
        <RelationManager
          projectId={projectId!}
          entityId={taskId!}
          entityType="tasks"
          relations={relations}
          onRefresh={load}
        />
      </Section>

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete Task"
        message={`Are you sure you want to delete "${task.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </Box>
  );
}
