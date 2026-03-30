import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, CircularProgress, Alert, useTheme, alpha,
  List, ListItemButton, ListItemText, Chip, LinearProgress, Button,
} from '@mui/material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RateReviewIcon from '@mui/icons-material/RateReview';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ScheduleIcon from '@mui/icons-material/Schedule';
import FlagIcon from '@mui/icons-material/Flag';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import {
  listTasks,
  COLUMNS, PRIORITY_COLORS, STATUS_BADGE_COLOR,
  priorityLabel, statusLabel,
  type Task, type TaskStatus, type TaskPriority,
} from '@/entities/task/index.ts';
import { listTeam, type TeamMember } from '@/entities/project/api.ts';
import { listEpics, listEpicTasks, type Epic } from '@/entities/epic/index.ts';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { Section, StatusBadge } from '@/shared/ui/index.ts';
import { TasksTabs } from './TasksTabs.tsx';

const DAY_MS = 86_400_000;
const DONE_STATUSES: TaskStatus[] = ['done', 'cancelled'];

export default function TaskSummaryPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [epicTaskCounts, setEpicTaskCounts] = useState<Map<string, { done: number; total: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const { items } = await listTasks(projectId, { limit: 1000 });
      setTasks(items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!projectId) return;
    listTeam(projectId).then(setTeam).catch(() => {});
    listEpics(projectId).then(async ({ items }) => {
      setEpics(items);
      const counts = new Map<string, { done: number; total: number }>();
      await Promise.all(items.map(async (epic) => {
        const tasks = await listEpicTasks(projectId, epic.id).catch(() => []);
        const done = tasks.filter(t => DONE_STATUSES.includes(t.status)).length;
        counts.set(epic.id, { done, total: tasks.length });
      }));
      setEpicTaskCounts(counts);
    }).catch(() => {});
  }, [projectId]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('task:') || event.type.startsWith('epic:')) refresh();
  }, [refresh]));

  const stats = useMemo(() => {
    const byStatus = new Map<TaskStatus, number>();
    const byPriority = new Map<TaskPriority, number>();
    const byAssignee = new Map<string, number>();
    const overdue: Task[] = [];
    const upcoming: Task[] = [];

    const now = new Date(); now.setHours(0, 0, 0, 0);
    const weekLater = new Date(now.getTime() + 7 * DAY_MS);

    let unassigned = 0;

    for (const t of tasks) {
      byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
      byPriority.set(t.priority, (byPriority.get(t.priority) ?? 0) + 1);

      const isActive = !DONE_STATUSES.includes(t.status);

      if (isActive && t.assignee) {
        byAssignee.set(t.assignee, (byAssignee.get(t.assignee) ?? 0) + 1);
      }
      if (isActive && !t.assignee) {
        unassigned++;
      }

      if (t.dueDate && isActive) {
        const due = new Date(t.dueDate); due.setHours(0, 0, 0, 0);
        if (due.getTime() < now.getTime()) overdue.push(t);
        else if (due.getTime() <= weekLater.getTime()) upcoming.push(t);
      }
    }

    const done = (byStatus.get('done') ?? 0) + (byStatus.get('cancelled') ?? 0);
    const active = tasks.length - done;
    const inReview = byStatus.get('review') ?? 0;

    // Recently updated — sorted by updatedAt desc
    const recentlyUpdated = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);

    // Due soon — sorted by dueDate asc
    upcoming.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
    overdue.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));

    return { byStatus, byPriority, byAssignee, overdue, upcoming, recentlyUpdated, done, active, inReview, unassigned, total: tasks.length };
  }, [tasks]);

  if (loading) {
    return <Box><TasksTabs /><Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box></Box>;
  }

  if (error) {
    return <Box><TasksTabs /><Alert severity="error">{error}</Alert></Box>;
  }

  const listUrl = (params?: string) => `/${projectId}/tasks/list${params ? `?${params}` : ''}`;
  const statCards = [
    { label: 'Total', value: stats.total, icon: <AssignmentIcon />, color: palette.primary.main, href: listUrl() },
    { label: 'Active', value: stats.active, icon: <PlayArrowIcon />, color: '#f57c00', href: listUrl('status=backlog&status=todo&status=in_progress&status=review') },
    { label: 'Completed', value: stats.done, icon: <CheckCircleIcon />, color: '#388e3c', href: listUrl('status=done&status=cancelled') },
    { label: 'Overdue', value: stats.overdue.length, icon: <ErrorOutlineIcon />, color: '#d32f2f', href: listUrl() },
    { label: 'In Review', value: stats.inReview, icon: <RateReviewIcon />, color: '#7b1fa2', href: listUrl('status=review') },
    { label: 'Unassigned', value: stats.unassigned, icon: <PersonOffIcon />, color: '#616161', href: listUrl('assignee=none') },
  ];

  return (
    <Box>
      <TasksTabs />

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, gap: 2, mb: 3 }}>
        {statCards.map(card => (
          <Card key={card.label} variant="outlined" sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }} onClick={() => navigate(card.href)}>
            <CardContent sx={{ py: 2, px: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Box sx={{ color: card.color }}>{card.icon}</Box>
                <Typography variant="caption" sx={{ color: palette.custom.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {card.label}
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700}>{card.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* All sections in 3-column grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3, mb: 3 }}>
        <Section title="By Status">
          <List dense disablePadding>
            {COLUMNS.map(col => {
              const count = stats.byStatus.get(col.status) ?? 0;
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <ListItemButton key={col.status} sx={{ borderRadius: 1, py: 0.5, px: 1.5 }} onClick={() => navigate(listUrl(`status=${col.status}`))}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: col.color, flexShrink: 0, mr: 1.5 }} />
                  <ListItemText primary={<Typography variant="body2">{col.label}</Typography>} />
                  <Typography variant="body2" fontWeight={600} sx={{ mr: 1.5 }}>{count}</Typography>
                  <Box sx={{ width: 60, height: 5, bgcolor: alpha(col.color, 0.15), borderRadius: 3, overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: col.color, borderRadius: 3 }} />
                  </Box>
                </ListItemButton>
              );
            })}
          </List>
        </Section>

        <Section title="By Priority">
          <List dense disablePadding>
            {(['critical', 'high', 'medium', 'low'] as const).map(p => {
              const count = stats.byPriority.get(p) ?? 0;
              const color = PRIORITY_COLORS[p];
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <ListItemButton key={p} sx={{ borderRadius: 1, py: 0.5, px: 1.5 }} onClick={() => navigate(`/${projectId}/tasks/list?priority=${p}`)}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color, flexShrink: 0, mr: 1.5 }} />
                  <ListItemText primary={<Typography variant="body2">{priorityLabel(p)}</Typography>} />
                  <Typography variant="body2" fontWeight={600} sx={{ mr: 1.5 }}>{count}</Typography>
                  <Box sx={{ width: 60, height: 5, bgcolor: alpha(color, 0.15), borderRadius: 3, overflow: 'hidden' }}>
                    <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: color, borderRadius: 3 }} />
                  </Box>
                </ListItemButton>
              );
            })}
          </List>
        </Section>

        {team.length > 0 && (
          <Section
            title="By Assignee"
            action={team.length > 6 ? <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/${projectId}/tasks/list`)}>View all</Button> : undefined}
          >
            <List dense disablePadding>
              {team.slice(0, 6).map(m => {
                const count = stats.byAssignee.get(m.id) ?? 0;
                const pct = stats.active > 0 ? (count / stats.active) * 100 : 0;
                return (
                  <ListItemButton key={m.id} sx={{ borderRadius: 1, py: 0.5, px: 1.5 }} onClick={() => navigate(`/${projectId}/tasks/list?assignee=${m.id}`)}>
                    <ListItemText primary={<Typography variant="body2">{m.name || m.id}</Typography>} />
                    <Typography variant="body2" fontWeight={600} sx={{ mr: 1.5 }}>{count}</Typography>
                    <Box sx={{ width: 60, height: 5, bgcolor: alpha(palette.primary.main, 0.15), borderRadius: 3, overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: palette.primary.main, borderRadius: 3 }} />
                    </Box>
                  </ListItemButton>
                );
              })}
            </List>
          </Section>
        )}

        {epics.length > 0 && (
          <Section
            title="By Epic"
            action={epics.filter(e => e.status === 'open' || e.status === 'in_progress').length > 6 ? <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/${projectId}/tasks/epics`)}>View all</Button> : undefined}
          >
            <List dense disablePadding>
              {epics.filter(e => e.status === 'open' || e.status === 'in_progress').slice(0, 6).map(e => {
                const counts = epicTaskCounts.get(e.id) ?? { done: 0, total: 0 };
                const pct = counts.total > 0 ? (counts.done / counts.total) * 100 : 0;
                const color = e.status === 'open' ? '#1976d2' : '#f57c00';
                return (
                  <ListItemButton key={e.id} sx={{ borderRadius: 1, py: 0.5, px: 1.5 }} onClick={() => navigate(`/${projectId}/tasks/epics/${e.id}`)}>
                    <FlagIcon sx={{ fontSize: 14, color, mr: 1, flexShrink: 0 }} />
                    <ListItemText primary={<Typography variant="body2" noWrap>{e.title}</Typography>} />
                    <Typography variant="caption" fontWeight={600} sx={{ color: palette.custom.textMuted, mr: 1, flexShrink: 0 }}>
                      {counts.done}/{counts.total}
                    </Typography>
                    <Box sx={{ width: 60, flexShrink: 0 }}>
                      <LinearProgress
                        variant="determinate"
                        value={pct}
                        sx={{
                          height: 5, borderRadius: 3,
                          bgcolor: alpha(color, 0.15),
                          '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
                        }}
                      />
                    </Box>
                  </ListItemButton>
                );
              })}
            </List>
          </Section>
        )}

        <Section
          title="Recently Updated"
          action={stats.recentlyUpdated.length > 6 ? <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/${projectId}/tasks/list`)}>View all</Button> : undefined}
        >
          <List dense disablePadding>
            {stats.recentlyUpdated.slice(0, 6).map(t => (
              <ListItemButton key={t.id} sx={{ borderRadius: 1, py: 0.5, px: 1.5 }} onClick={() => navigate(`/${projectId}/tasks/${t.id}`)}>
                <ListItemText
                  primary={<Typography variant="body2" fontWeight={500} noWrap>{t.title}</Typography>}
                  sx={{ mr: 1 }}
                />
                <StatusBadge label={statusLabel(t.status)} color={STATUS_BADGE_COLOR[t.status]} size="small" />
              </ListItemButton>
            ))}
          </List>
        </Section>

        {/* Upcoming Due + Overdue */}
        <Section
          title={`Due Soon${stats.overdue.length > 0 ? ` & Overdue (${stats.overdue.length})` : ''}`}
          action={(stats.overdue.length + stats.upcoming.length) > 6 ? <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/${projectId}/tasks/list`)}>View all</Button> : undefined}
        >
          <List dense disablePadding>
            {stats.overdue.length === 0 && stats.upcoming.length === 0 && (
              <Typography variant="body2" sx={{ color: palette.custom.textMuted, py: 1, px: 1.5 }}>No upcoming deadlines</Typography>
            )}
            {stats.overdue.slice(0, 6).map(t => {
              const now = new Date(); now.setHours(0, 0, 0, 0);
              const due = new Date(t.dueDate!); due.setHours(0, 0, 0, 0);
              const days = Math.round((now.getTime() - due.getTime()) / DAY_MS);
              return (
                <ListItemButton key={t.id} sx={{ borderRadius: 1, py: 0.5, px: 1.5 }} onClick={() => navigate(`/${projectId}/tasks/${t.id}`)}>
                  <ListItemText primary={<Typography variant="body2" fontWeight={500} noWrap>{t.title}</Typography>} sx={{ mr: 1 }} />
                  <Chip
                    icon={<ScheduleIcon sx={{ fontSize: '14px !important' }} />}
                    label={`${days}d overdue`}
                    size="small"
                    color="error"
                    sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' } }}
                  />
                </ListItemButton>
              );
            })}
            {stats.upcoming.slice(0, Math.max(0, 5 - stats.overdue.slice(0, 6).length)).map(t => {
              const now = new Date(); now.setHours(0, 0, 0, 0);
              const due = new Date(t.dueDate!); due.setHours(0, 0, 0, 0);
              const days = Math.round((due.getTime() - now.getTime()) / DAY_MS);
              return (
                <ListItemButton key={t.id} sx={{ borderRadius: 1, py: 0.5, px: 1.5 }} onClick={() => navigate(`/${projectId}/tasks/${t.id}`)}>
                  <ListItemText primary={<Typography variant="body2" fontWeight={500} noWrap>{t.title}</Typography>} sx={{ mr: 1 }} />
                  <Chip
                    icon={<ScheduleIcon sx={{ fontSize: '14px !important' }} />}
                    label={days === 0 ? 'today' : `${days}d`}
                    size="small"
                    color={days === 0 ? 'warning' : 'default'}
                    sx={{ height: 20, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' } }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </Section>
      </Box>
    </Box>
  );
}
