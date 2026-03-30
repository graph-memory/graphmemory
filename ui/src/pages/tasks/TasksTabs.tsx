import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Tabs, Tab, Box } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import FlagIcon from '@mui/icons-material/Flag';

const TABS = [
  { label: 'Summary', value: 'summary', icon: <DashboardIcon fontSize="small" /> },
  { label: 'List', value: 'list', icon: <ViewListIcon fontSize="small" /> },
  { label: 'Board', value: 'board', icon: <ViewKanbanIcon fontSize="small" /> },
  { label: 'Epics', value: 'epics', icon: <FlagIcon fontSize="small" /> },
] as const;

export function TasksTabs() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const current = TABS.find(t => pathname.includes(`/tasks/${t.value}`))?.value ?? 'summary';

  return (
    <Box sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={current}
        onChange={(_, v) => navigate(`/${projectId}/tasks/${v}`)}
        sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
      >
        {TABS.map(t => (
          <Tab key={t.value} value={t.value} label={t.label} icon={t.icon} iconPosition="start" />
        ))}
      </Tabs>
    </Box>
  );
}
