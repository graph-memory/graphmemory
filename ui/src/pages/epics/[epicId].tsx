import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, CircularProgress,
  LinearProgress, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Select, MenuItem, alpha, useTheme,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ViewListIcon from '@mui/icons-material/ViewList';
import { getEpic, updateEpic, deleteEpic, listEpicTasks, type Epic, type EpicStatus, type EpicPriority } from '@/entities/epic/index.ts';
import type { Task } from '@/entities/task/index.ts';
import { PRIORITY_BADGE_COLOR, PRIORITY_COLORS, priorityLabel, statusLabel } from '@/entities/task/index.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import {
  PageTopBar, Section, FieldRow, StatusBadge, Tags, CopyButton,
  DateDisplay, ConfirmDialog, MarkdownRenderer, DetailLayout,
} from '@/shared/ui/index.ts';

const EPIC_STATUS_COLOR: Record<string, string> = {
  open: '#1976d2',
  in_progress: '#f57c00',
  done: '#388e3c',
  cancelled: '#d32f2f',
};

const EPIC_STATUS_BADGE: Record<string, 'primary' | 'warning' | 'success' | 'error'> = {
  open: 'primary',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'error',
};

function epicStatusLabel(s: string): string {
  if (!s) return '—';
  return { open: 'OPEN', in_progress: 'IN PROGRESS', done: 'DONE', cancelled: 'CANCELLED' }[s] ?? s.toUpperCase();
}

export default function EpicDetailPage() {
  const { projectId, epicId } = useParams<{ projectId: string; epicId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const canWrite = useCanWrite('tasks');
  const [epic, setEpic] = useState<Epic | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId || !epicId) return;
    try {
      const [e, t] = await Promise.all([
        getEpic(projectId, epicId),
        listEpicTasks(projectId, epicId),
      ]);
      setEpic(e);
      setTasks(t);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, epicId]);

  useEffect(() => { refresh(); }, [refresh]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('epic:') || event.type.startsWith('task:')) refresh();
  }, [refresh]));

  const handleDelete = async () => {
    if (!projectId || !epicId) return;
    setDeleting(true);
    try {
      await deleteEpic(projectId, epicId);
      navigate(`/${projectId}/tasks/epics`);
    } finally { setDeleting(false); }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (error || !epic) return <Alert severity="error">{error || 'Epic not found'}</Alert>;

  const progressPct = epic.progress.total > 0 ? (epic.progress.done / epic.progress.total) * 100 : 0;

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Tasks', to: `/${projectId}/tasks` },
          { label: 'Epics', to: `/${projectId}/tasks/epics` },
          { label: epic.title },
        ]}
        actions={
          canWrite ? (
            <>
              <Button startIcon={<EditIcon />} onClick={() => navigate(`/${projectId}/tasks/epics/${epicId}/edit`)}>Edit</Button>
              <Button startIcon={<DeleteIcon />} color="error" onClick={() => setDeleteOpen(true)}>Delete</Button>
            </>
          ) : undefined
        }
      />

      <DetailLayout
        main={
          <>
            {epic.description && (
              <Section title="Description" sx={{ mb: 3 }}>
                <MarkdownRenderer>{epic.description}</MarkdownRenderer>
              </Section>
            )}

            <Section
              title={`Tasks (${tasks.length})`}
              action={tasks.length > 0 ? (
                <Button size="small" startIcon={<ViewListIcon />} onClick={() => navigate(`/${projectId}/tasks/list?epic=${epicId}`)}>
                  View in list
                </Button>
              ) : undefined}
            >
              {tasks.length === 0 ? (
                <Typography variant="body2" sx={{ color: palette.custom.textMuted, py: 2 }}>
                  No tasks linked to this epic yet.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell width={120}>Status</TableCell>
                      <TableCell width={100}>Priority</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {tasks.map(task => (
                      <TableRow
                        key={task.id}
                        hover
                        sx={{ cursor: 'pointer' }}
                        onClick={() => navigate(`/${projectId}/tasks/${task.id}?from=epic&epicId=${epicId}`)}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={500}>{task.title}</Typography>
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            label={statusLabel(task.status)}
                            color={({ backlog: 'neutral', todo: 'primary', in_progress: 'warning', review: 'primary', done: 'success', cancelled: 'error' } as const)[task.status]}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge label={priorityLabel(task.priority)} color={PRIORITY_BADGE_COLOR[task.priority]} size="small" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Section>
          </>
        }
        sidebar={
          <>
            {/* Progress */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" sx={{ color: palette.custom.textMuted }}>Progress</Typography>
                <Typography variant="body2" fontWeight={600} sx={{ color: palette.custom.textMuted }}>
                  {epic.progress.done} / {epic.progress.total}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressPct}
                sx={{
                  height: 6, borderRadius: 3,
                  bgcolor: alpha(EPIC_STATUS_COLOR[epic.status] ?? '#616161', 0.15),
                  '& .MuiLinearProgress-bar': { bgcolor: EPIC_STATUS_COLOR[epic.status] ?? '#616161', borderRadius: 3 },
                }}
              />
            </Paper>

            <Section title="Properties" sx={{ mb: 3 }}>
              <FieldRow label="ID">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{epic.id}</Typography>
                  <CopyButton value={epic.id} />
                </Box>
              </FieldRow>
              <FieldRow label="Status">
                {canWrite ? (
                  <Select
                    size="small"
                    value={epic.status}
                    onChange={async (e) => {
                      const s = e.target.value as EpicStatus;
                      setEpic(prev => prev ? { ...prev, status: s } : prev);
                      await updateEpic(projectId!, epicId!, { status: s });
                      refresh();
                    }}
                    variant="standard"
                    disableUnderline
                    sx={{
                      bgcolor: alpha(EPIC_STATUS_COLOR[epic.status] ?? '#616161', 0.12),
                      color: EPIC_STATUS_COLOR[epic.status] ?? '#616161',
                      fontWeight: 600, fontSize: '0.75rem', borderRadius: '999px',
                      border: `1px solid ${alpha(EPIC_STATUS_COLOR[epic.status] ?? '#616161', 0.3)}`,
                      height: 26, minWidth: 70,
                      '& .MuiSelect-select': { py: '2px', px: 1.2, display: 'flex', alignItems: 'center' },
                      '& .MuiSelect-icon': { fontSize: '1rem', color: EPIC_STATUS_COLOR[epic.status] ?? '#616161', right: 4 },
                      '&:before, &:after': { display: 'none' },
                    }}
                  >
                    {(['open', 'in_progress', 'done', 'cancelled'] as const).map(s => (
                      <MenuItem key={s} value={s}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: EPIC_STATUS_COLOR[s] }} />
                          {epicStatusLabel(s)}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                ) : (
                  <StatusBadge label={epicStatusLabel(epic.status)} color={EPIC_STATUS_BADGE[epic.status] ?? 'neutral'} />
                )}
              </FieldRow>
              <FieldRow label="Priority">
                {canWrite ? (
                  <Select
                    size="small"
                    value={epic.priority}
                    onChange={async (e) => {
                      const p = e.target.value as EpicPriority;
                      setEpic(prev => prev ? { ...prev, priority: p } : prev);
                      await updateEpic(projectId!, epicId!, { priority: p });
                      refresh();
                    }}
                    variant="standard"
                    disableUnderline
                    sx={{
                      bgcolor: alpha(PRIORITY_COLORS[epic.priority], 0.12),
                      color: PRIORITY_COLORS[epic.priority],
                      fontWeight: 600, fontSize: '0.75rem', borderRadius: '999px',
                      border: `1px solid ${alpha(PRIORITY_COLORS[epic.priority], 0.3)}`,
                      height: 26, minWidth: 70,
                      '& .MuiSelect-select': { py: '2px', px: 1.2, display: 'flex', alignItems: 'center' },
                      '& .MuiSelect-icon': { fontSize: '1rem', color: PRIORITY_COLORS[epic.priority], right: 4 },
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
                  <StatusBadge label={priorityLabel(epic.priority)} color={PRIORITY_BADGE_COLOR[epic.priority]} />
                )}
              </FieldRow>
              <FieldRow label="Tags">
                {epic.tags.length > 0 ? <Tags tags={epic.tags} /> : <Typography variant="body2" color="text.secondary">—</Typography>}
              </FieldRow>
              <FieldRow label="Created"><DateDisplay value={epic.createdAt} showTime showRelative /></FieldRow>
              <FieldRow label="Updated" divider={false}><DateDisplay value={epic.updatedAt} showTime showRelative /></FieldRow>
            </Section>
          </>
        }
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Epic"
        message={`Delete "${epic.title}"? Tasks linked to it will NOT be deleted.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
        loading={deleting}
      />
    </Box>
  );
}
