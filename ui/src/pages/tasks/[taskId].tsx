import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, CircularProgress, Link,
  Select, MenuItem, Stack, alpha,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FlagIcon from '@mui/icons-material/Flag';
import { listEpics, linkTaskToEpic, unlinkTaskFromEpic, type Epic } from '@/entities/epic/index.ts';
import {
  getTask, updateTask, deleteTask, moveTask, listTaskRelations,
  listTaskAttachments, uploadTaskAttachment, deleteTaskAttachment, taskAttachmentUrl,
  type Task, type TaskStatus, type TaskRelation, type AttachmentMeta,
  COLUMNS, STATUS_BADGE_COLOR, PRIORITY_BADGE_COLOR, PRIORITY_COLORS, statusLabel, priorityLabel, type TaskPriority,
} from '@/entities/task/index.ts';
import { listTeam, type TeamMember } from '@/entities/project/api.ts';
import { RelationManager } from '@/features/relation-manager/index.ts';
import { AttachmentSection } from '@/features/attachments/index.ts';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import {
  PageTopBar, Section, FieldRow, StatusBadge, Tags, CopyButton, DateDisplay, ConfirmDialog, MarkdownRenderer, DetailLayout,
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
  const [searchParams] = useSearchParams();
  const from = searchParams.get('from');
  const epicId = searchParams.get('epicId');
  const canWrite = useCanWrite('tasks');
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [relations, setRelations] = useState<TaskRelation[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !taskId) return;
    try {
      const [t, rels, atts, members] = await Promise.all([
        getTask(projectId, taskId) as Promise<TaskDetail>,
        listTaskRelations(projectId, taskId),
        listTaskAttachments(projectId, taskId),
        listTeam(projectId).catch(() => [] as TeamMember[]),
      ]);
      setTask(t);
      setRelations(rels);
      setAttachments(atts);
      setTeam(members);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  const loadEpics = useCallback(() => {
    if (projectId) listEpics(projectId).then(({ items }) => setEpics(items)).catch(e => console.error('Failed to load epics', e));
  }, [projectId]);

  useEffect(() => { load(); loadEpics(); }, [load, loadEpics]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('task:')) load();
    if (event.type.startsWith('epic:')) { load(); loadEpics(); }
  }, [load, loadEpics]));

  const handleDelete = async () => {
    if (!projectId || !taskId) return;
    await deleteTask(projectId, taskId);
    navigate(`/${projectId}/tasks`);
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
          ...(from === 'board' ? [{ label: 'Board', to: `/${projectId}/tasks/board` }] :
              from === 'list' ? [{ label: 'List', to: `/${projectId}/tasks/list` }] :
              from === 'epic' && epicId ? [
                { label: 'Epics', to: `/${projectId}/tasks/epics` },
                { label: epics.find(e => e.id === epicId)?.title ?? 'Epic', to: `/${projectId}/tasks/epics/${epicId}` },
              ] : []),
          { label: task.title },
        ]}
        actions={
          canWrite ? (
            <>
              <Button variant="contained" color="success" startIcon={<EditIcon />} onClick={() => {
                    const params = new URLSearchParams();
                    if (from) params.set('from', from);
                    if (epicId) params.set('epicId', epicId);
                    const qs = params.toString();
                    navigate(`/${projectId}/tasks/${taskId}/edit${qs ? `?${qs}` : ''}`);
                  }}>
                Edit
              </Button>
              <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteConfirm(true)}>
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <DetailLayout
        main={
          <>
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
                readOnly={!canWrite}
              />
            </Section>

            <Section title="Relations">
              <RelationManager
                projectId={projectId!}
                entityId={taskId!}
                entityType="tasks"
                relations={relations}
                onRefresh={load}
              />
            </Section>
          </>
        }
        sidebar={
          <>
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
                {canWrite ? (
                  <Select
                    size="small"
                    value={task.status}
                    onChange={async (e) => {
                      const s = e.target.value as TaskStatus;
                      setTask(prev => prev ? { ...prev, status: s } : prev);
                      await moveTask(projectId!, taskId!, s);
                      load();
                    }}
                    variant="standard"
                    disableUnderline
                    sx={{
                      bgcolor: alpha(COLUMNS.find(c => c.status === task.status)?.color ?? '#616161', 0.12),
                      color: COLUMNS.find(c => c.status === task.status)?.color ?? '#616161',
                      fontWeight: 600, fontSize: '0.75rem', borderRadius: '999px',
                      border: `1px solid ${alpha(COLUMNS.find(c => c.status === task.status)?.color ?? '#616161', 0.3)}`,
                      height: 26, minWidth: 70,
                      '& .MuiSelect-select': { py: '2px', px: 1.2, display: 'flex', alignItems: 'center' },
                      '& .MuiSelect-icon': { fontSize: '1rem', color: COLUMNS.find(c => c.status === task.status)?.color ?? '#616161', right: 4 },
                      '&:before, &:after': { display: 'none' },
                    }}
                  >
                    {COLUMNS.map(c => (
                      <MenuItem key={c.status} value={c.status}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.color }} />
                          {c.label}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                ) : (
                  <StatusBadge label={statusLabel(task.status)} color={STATUS_BADGE_COLOR[task.status]} />
                )}
              </FieldRow>
              <FieldRow label="Priority">
                {canWrite ? (
                  <Select
                    size="small"
                    value={task.priority}
                    onChange={async (e) => {
                      const p = e.target.value as TaskPriority;
                      setTask(prev => prev ? { ...prev, priority: p } : prev);
                      await updateTask(projectId!, taskId!, { priority: p });
                      load();
                    }}
                    variant="standard"
                    disableUnderline
                    sx={{
                      bgcolor: alpha(PRIORITY_COLORS[task.priority], 0.12),
                      color: PRIORITY_COLORS[task.priority],
                      fontWeight: 600, fontSize: '0.75rem', borderRadius: '999px',
                      border: `1px solid ${alpha(PRIORITY_COLORS[task.priority], 0.3)}`,
                      height: 26, minWidth: 70,
                      '& .MuiSelect-select': { py: '2px', px: 1.2, display: 'flex', alignItems: 'center' },
                      '& .MuiSelect-icon': { fontSize: '1rem', color: PRIORITY_COLORS[task.priority], right: 4 },
                      '&:before, &:after': { display: 'none' },
                    }}
                  >
                    {(['critical', 'high', 'medium', 'low'] as const).map(p => (
                      <MenuItem key={p} value={p}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PRIORITY_COLORS[p] }} />
                          {priorityLabel(p)}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                ) : (
                  <StatusBadge label={priorityLabel(task.priority)} color={PRIORITY_BADGE_COLOR[task.priority]} />
                )}
              </FieldRow>
              <FieldRow label="Tags">
                {task.tags.length > 0 ? <Tags tags={task.tags} /> : <Typography variant="body2" color="text.secondary">—</Typography>}
              </FieldRow>
              <FieldRow label="Epic">
                {(() => {
                  const epicLink = relations.find(r => r.kind === 'belongs_to');
                  const currentEpicId = epicLink ? String(epicLink.toId) : '';
                  const selectableEpics = epics.filter(e => e.status === 'open' || e.status === 'in_progress' || e.id === currentEpicId);
                  if (!canWrite) {
                    if (!epicLink) return <Typography variant="body2" color="text.secondary">—</Typography>;
                    return (
                      <Link component="button" variant="body2" onClick={() => navigate(`/${projectId}/tasks/epics/${currentEpicId}`)}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <FlagIcon sx={{ fontSize: 14, color: '#1976d2' }} />
                          {epicLink.title || currentEpicId}
                        </Box>
                      </Link>
                    );
                  }
                  return (
                    <Select
                      size="small"
                      value={currentEpicId}
                      displayEmpty
                      onChange={async (e) => {
                        const newEpicId = e.target.value as string;
                        if (epicLink) await unlinkTaskFromEpic(projectId!, currentEpicId, taskId!);
                        if (newEpicId) await linkTaskToEpic(projectId!, newEpicId, taskId!);
                        load();
                      }}
                      renderValue={(v) => {
                        if (!v) return <Typography variant="body2" color="text.secondary">No epic</Typography>;
                        const ep = epics.find(e => e.id === v);
                        return (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <FlagIcon sx={{ fontSize: 14, color: '#1976d2' }} />
                            {ep?.title ?? v}
                          </Box>
                        );
                      }}
                      sx={{ fontSize: '0.85rem', width: '100%' }}
                    >
                      <MenuItem value="">No epic</MenuItem>
                      {selectableEpics.map(e => (
                        <MenuItem key={e.id} value={e.id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FlagIcon sx={{ fontSize: 14, color: e.status === 'open' ? '#1976d2' : '#f57c00' }} />
                            {e.title}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  );
                })()}
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
              {(canWrite || task.assigneeId != null) && (
                <FieldRow label="Assignee">
                  {canWrite ? (
                    <Select
                      size="small"
                      value={task.assigneeId == null ? '' : String(task.assigneeId)}
                      displayEmpty
                      onChange={async (e) => {
                        const raw = e.target.value as string;
                        const assigneeId = raw === '' ? null : Number(raw);
                        setTask(prev => prev ? { ...prev, assigneeId } : prev);
                        await updateTask(projectId!, taskId!, { assigneeId });
                        load();
                      }}
                      renderValue={(v) => {
                        if (v === '' || v == null) return <Typography variant="body2" color="text.secondary">Unassigned</Typography>;
                        const m = team.find(t => t.id === Number(v));
                        return <Typography variant="body2">{m?.name ?? m?.slug ?? String(v)}</Typography>;
                      }}
                      sx={{ fontSize: '0.85rem', width: '100%' }}
                    >
                      <MenuItem value="">Unassigned</MenuItem>
                      {team.map(m => (
                        <MenuItem key={m.id} value={String(m.id)}>{m.name}</MenuItem>
                      ))}
                    </Select>
                  ) : (
                    <Typography variant="body2">{team.find(m => m.id === task.assigneeId)?.name ?? task.assigneeId}</Typography>
                  )}
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
          </>
        }
      />

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
