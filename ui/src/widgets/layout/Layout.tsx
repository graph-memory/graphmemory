import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  AppBar, Box, Chip, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, ListSubheader, Toolbar, Typography, Select, MenuItem,
  Divider, useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import SearchIcon from '@mui/icons-material/Search';
import HubIcon from '@mui/icons-material/Hub';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { useProjects, type WorkspaceInfo } from '@/entities/project/index.ts';
import { useThemeMode } from '@/shared/lib/ThemeModeContext.tsx';
import { WsProvider } from '@/shared/lib/useWebSocket.ts';

const DRAWER_WIDTH = 240;
const APPBAR_HEIGHT = 64;

const NAV_ITEMS = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: 'dashboard' },
  { label: 'Knowledge', icon: <LightbulbIcon />, path: 'knowledge' },
  { label: 'Tasks', icon: <ViewKanbanIcon />, path: 'tasks' },
  { label: 'Skills', icon: <PsychologyIcon />, path: 'skills' },
  { label: 'Docs', icon: <DescriptionIcon />, path: 'docs' },
  { label: 'Files', icon: <FolderIcon />, path: 'files' },
  { label: 'Search', icon: <SearchIcon />, path: 'search' },
  { label: 'Graph', icon: <HubIcon />, path: 'graph' },
  { label: 'Prompts', icon: <AutoAwesomeIcon />, path: 'prompts' },
  { label: 'Tools', icon: <BuildIcon />, path: 'tools' },
  { label: 'Help', icon: <MenuBookIcon />, path: 'help' },
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  knowledge: 'Knowledge',
  tasks: 'Tasks',
  skills: 'Skills',
  docs: 'Docs',
  files: 'Files',
  search: 'Search',
  graph: 'Graph',
  prompts: 'Prompts',
  tools: 'Tools',
  help: 'Help',
};

function getPageTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const page = segments[1] || 'dashboard';
  return PAGE_TITLES[page] || 'Dashboard';
}

function buildDocumentTitle(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const projectId = segments[0] || '';
  const parts: string[] = [projectId];
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (seg === 'view') continue;
    parts.push(PAGE_TITLES[seg] || seg);
  }
  if (parts.length === 1) parts.push('Dashboard');
  return parts.join(' :: ');
}

/** Build grouped menu items: workspace subheaders + project items, then standalone projects. */
function buildGroupedItems(
  projects: { id: string; workspaceId: string | null }[],
  workspaces: WorkspaceInfo[],
): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  const placed = new Set<string>();

  for (const ws of workspaces) {
    const wsProjects = projects.filter(p => p.workspaceId === ws.id);
    if (wsProjects.length === 0) continue;
    items.push(
      <ListSubheader key={`ws-${ws.id}`} sx={{ lineHeight: '32px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {ws.id}
      </ListSubheader>
    );
    for (const p of wsProjects) {
      items.push(<MenuItem key={p.id} value={p.id}>{p.id}</MenuItem>);
      placed.add(p.id);
    }
  }

  const standalone = projects.filter(p => !placed.has(p.id));
  if (standalone.length > 0 && workspaces.length > 0) {
    items.push(
      <ListSubheader key="ws-standalone" sx={{ lineHeight: '32px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Standalone
      </ListSubheader>
    );
  }
  for (const p of standalone) {
    items.push(<MenuItem key={p.id} value={p.id}>{p.id}</MenuItem>);
  }

  return items;
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { projects, workspaces, loading } = useProjects();
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();
  const { mode, toggle } = useThemeMode();
  const { palette } = useTheme();

  const currentProject = projects.find(p => p.id === projectId);

  const pageTitle = getPageTitle(location.pathname);
  const documentTitle = buildDocumentTitle(location.pathname);

  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  const handleProjectChange = (id: string) => {
    const segment = location.pathname.split('/').slice(2).join('/') || 'knowledge';
    navigate(`/${id}/${segment}`);
  };

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar>
        <HubIcon sx={{ mr: 1, color: 'primary.main' }} />
        <Typography variant="subtitle1" fontWeight={700} noWrap>
          Graph Memory
        </Typography>
      </Toolbar>
      <Divider />
      <Box sx={{ px: 2, py: 1.5 }}>
        <Select
          fullWidth
          size="small"
          value={projectId || ''}
          onChange={(e) => handleProjectChange(e.target.value)}
          disabled={loading}
          displayEmpty
          renderValue={(value) => (
            <Typography variant="body2" fontWeight={600} noWrap>
              {value || 'Select project'}
            </Typography>
          )}
        >
          {buildGroupedItems(projects, workspaces)}
        </Select>
      </Box>
      <Divider />
      <List sx={{ flex: 1, px: 1 }}>
        {NAV_ITEMS.map(({ label, icon, path }) => {
          const currentPage = location.pathname.split('/').filter(Boolean)[1] || '';
          const active = currentPage === path;
          return (
            <ListItemButton
              key={path}
              selected={active}
              onClick={() => navigate(`/${projectId}/${path}`)}
              disabled={!projectId}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                ...(active && {
                  bgcolor: 'primary.main',
                  color: palette.custom.textOnPrimary,
                  '&:hover': {
                    bgcolor: 'primary.dark',
                  },
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: palette.custom.textOnPrimary,
                    '&:hover': {
                      bgcolor: 'primary.dark',
                    },
                  },
                }),
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 40,
                  color: active ? palette.custom.textOnPrimary : 'inherit',
                }}
              >
                {icon}
              </ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          color: 'text.primary',
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            color="inherit"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ display: { md: 'none' }, mr: 1 }}
          >
            <MenuIcon />
          </IconButton>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexGrow: 1 }}>
            <Typography variant="h6" noWrap>
              {pageTitle}
            </Typography>
            {currentProject?.workspaceId && (
              <Chip
                label={currentProject.workspaceId}
                size="small"
                variant="outlined"
                color="primary"
                sx={{ fontWeight: 600 }}
              />
            )}
          </Box>
          <IconButton color="inherit" onClick={toggle} title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}>
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          height: '100vh',
          overflow: 'auto',
          p: 3,
          pt: `${APPBAR_HEIGHT + 24}px`,
        }}
      >
        <WsProvider projectId={projectId ?? null}>
          <Outlet />
        </WsProvider>
      </Box>
    </Box>
  );
}
