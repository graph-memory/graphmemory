import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Card, CardContent, Button, Alert, CircularProgress,
  List, ListItemButton, ListItemIcon, ListItemText, useTheme,
} from '@mui/material';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import DescriptionIcon from '@mui/icons-material/Description';
import CodeIcon from '@mui/icons-material/Code';
import PsychologyIcon from '@mui/icons-material/Psychology';
import FolderIcon from '@mui/icons-material/Folder';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { getProjectStats, type ProjectDetailedStats } from '@/entities/project/index.ts';
import { listNotes, type Note } from '@/entities/note/index.ts';
import { listTasks, type Task } from '@/entities/task/index.ts';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { PageTopBar, Section, StatusBadge } from '@/shared/ui/index.ts';
import { STATUS_BADGE_COLOR, statusLabel } from '@/entities/task/index.ts';
import { useAccess } from '@/shared/lib/AccessContext.tsx';

interface StatCard {
  label: string;
  value: number;
  icon: React.ReactNode;
  path: string;
  color: string;
  graph: string;
}

export default function DashboardPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const { graphs } = useAccess();

  const canReadGraph = (gn: string) => {
    const g = graphs[gn];
    return g?.enabled !== false && g?.access !== 'deny' && g?.access !== null;
  };

  const [stats, setStats] = useState<ProjectDetailedStats | null>(null);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const [s, notes, tasks] = await Promise.all([
        getProjectStats(projectId),
        listNotes(projectId, { limit: 5 }).catch(() => []),
        listTasks(projectId, { limit: 10 }).catch(() => []),
      ]);
      setStats(s);
      setRecentNotes(notes);
      setRecentTasks(tasks);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  useWebSocket(projectId ?? null, useCallback(() => { load(); }, [load]));

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  const allStatCards: StatCard[] = [
    { label: 'Notes', value: stats?.knowledge?.nodes ?? 0, icon: <LightbulbIcon />, path: 'knowledge', graph: 'knowledge', color: palette.warning.main },
    { label: 'Tasks', value: stats?.tasks?.nodes ?? 0, icon: <ViewKanbanIcon />, path: 'tasks', graph: 'tasks', color: palette.primary.main },
    { label: 'Skills', value: (stats as Record<string, any>)?.skills?.nodes ?? 0, icon: <PsychologyIcon />, path: 'skills', graph: 'skills', color: '#9c27b0' },
    { label: 'Docs', value: stats?.docs?.nodes ?? 0, icon: <DescriptionIcon />, path: 'docs', graph: 'docs', color: palette.secondary.main },
    { label: 'Code Symbols', value: stats?.code?.nodes ?? 0, icon: <CodeIcon />, path: 'search', graph: 'code', color: palette.error.main },
    { label: 'Files', value: stats?.fileIndex?.nodes ?? 0, icon: <FolderIcon />, path: 'files', graph: 'files', color: palette.success.main },
  ];
  const statCards = allStatCards.filter(c => canReadGraph(c.graph));

  return (
    <Box>
      <PageTopBar breadcrumbs={[{ label: 'Dashboard' }]} />

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${Math.min(statCards.length, 6)}, 1fr)` }, gap: 2, mb: 3 }}>
        {statCards.map(card => (
          <Card
            key={card.label}
            variant="outlined"
            sx={{ cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }}
            onClick={() => navigate(`/${projectId}/${card.path}`)}
          >
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

      {/* Main area: recent notes + recent tasks */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3 }}>
        {/* Recent Notes */}
        {canReadGraph('knowledge') && (
          <Section
            title="Recent Notes"
            action={
              <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/${projectId}/knowledge`)}>
                View all
              </Button>
            }
          >
            {recentNotes.length === 0 ? (
              <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>No notes yet</Typography>
            ) : (
              <List dense disablePadding>
                {recentNotes.map(note => (
                  <ListItemButton
                    key={note.id}
                    onClick={() => navigate(`/${projectId}/knowledge/${note.id}`)}
                    sx={{ borderRadius: 1, py: 0.5 }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <LightbulbIcon fontSize="small" sx={{ color: palette.warning.main }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography variant="body2" fontWeight={500}>{note.title}</Typography>}
                      secondary={note.content ? note.content.slice(0, 60) + (note.content.length > 60 ? '...' : '') : undefined}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
            <Box sx={{ mt: 1.5 }}>
              <Button size="small" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/knowledge/new`)}>
                New Note
              </Button>
            </Box>
          </Section>
        )}

        {/* Recent Tasks */}
        {canReadGraph('tasks') && (
          <Section
            title="Recent Tasks"
            action={
              <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/${projectId}/tasks`)}>
                View all
              </Button>
            }
          >
            {recentTasks.length === 0 ? (
              <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>No tasks yet</Typography>
            ) : (
              <List dense disablePadding>
                {recentTasks.map(task => (
                  <ListItemButton
                    key={task.id}
                    onClick={() => navigate(`/${projectId}/tasks/${task.id}`)}
                    sx={{ borderRadius: 1, py: 0.75, px: 1.5 }}
                  >
                    <ListItemText
                      primary={<Typography variant="body2" fontWeight={500} noWrap>{task.title}</Typography>}
                      sx={{ mr: 2 }}
                    />
                    <StatusBadge label={statusLabel(task.status)} color={STATUS_BADGE_COLOR[task.status]} size="small" />
                  </ListItemButton>
                ))}
              </List>
            )}
            <Box sx={{ mt: 1.5 }}>
              <Button size="small" startIcon={<AddIcon />} onClick={() => navigate(`/${projectId}/tasks/new`)}>
                New Task
              </Button>
            </Box>
          </Section>
        )}
      </Box>
    </Box>
  );
}
