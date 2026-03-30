import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import {
  AppBar, Box, Button, Chip, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon,
  ListItemText, ListSubheader, Toolbar, Typography, Select, MenuItem,
  Divider, useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import ViewListIcon from '@mui/icons-material/ViewList';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import CodeIcon from '@mui/icons-material/Code';
import SearchIcon from '@mui/icons-material/Search';
import HubIcon from '@mui/icons-material/Hub';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PsychologyIcon from '@mui/icons-material/Psychology';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import BuildIcon from '@mui/icons-material/Build';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import LogoutIcon from '@mui/icons-material/Logout';
import CableIcon from '@mui/icons-material/Cable';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import AssignmentIcon from '@mui/icons-material/Assignment';
import FlagIcon from '@mui/icons-material/Flag';
import { useProjects, type WorkspaceInfo } from '@/entities/project/index.ts';
import { useThemeMode } from '@/shared/lib/ThemeModeContext.tsx';
import { WsProvider } from '@/shared/lib/useWebSocket.ts';
import { AccessProvider } from '@/shared/lib/AccessContext.tsx';
import { ConnectDialog } from './ConnectDialog.tsx';
import { WsStatusIndicator } from '@/shared/ui/WsStatusIndicator.tsx';

const DRAWER_WIDTH = 240;
const APPBAR_HEIGHT = 64;

const NAV_GRAPH_MAP: Record<string, string> = {
  knowledge: 'knowledge',
  tasks: 'tasks',
  skills: 'skills',
  docs: 'docs',
  code: 'code',
  files: 'files',
};

interface NavItemColor { dark: string; light: string }

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path: string;
  color?: NavItemColor;
  children?: Array<{ label: string; icon: React.ReactNode; path: string; color?: NavItemColor }>;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: <DashboardIcon />, path: 'dashboard', color: { dark: '#569cd6', light: '#1976d2' } },
  {
    label: 'Tasks', icon: <AssignmentIcon />, path: 'tasks', color: { dark: '#ce9178', light: '#d84315' },
    children: [
      { label: 'Board', icon: <ViewKanbanIcon />, path: 'tasks/board', color: { dark: '#ce9178', light: '#d84315' } },
      { label: 'List', icon: <ViewListIcon />, path: 'tasks/list', color: { dark: '#ce9178', light: '#d84315' } },
      { label: 'Epics', icon: <FlagIcon />, path: 'epics', color: { dark: '#ce9178', light: '#d84315' } },
    ],
  },
  { label: 'Knowledge', icon: <LightbulbIcon />, path: 'knowledge', color: { dark: '#dcdcaa', light: '#b8860b' } },
  { label: 'Skills', icon: <PsychologyIcon />, path: 'skills', color: { dark: '#c586c0', light: '#9c27b0' } },
  { label: 'Docs', icon: <DescriptionIcon />, path: 'docs', color: { dark: '#9cdcfe', light: '#0288d1' } },
  { label: 'Code', icon: <CodeIcon />, path: 'code', color: { dark: '#6a9955', light: '#2e7d32' } },
  { label: 'Files', icon: <FolderIcon />, path: 'files', color: { dark: '#d7ba7d', light: '#795548' } },
  { label: 'Search', icon: <SearchIcon />, path: 'search', color: { dark: '#b5cea8', light: '#558b2f' } },
  { label: 'Prompts', icon: <AutoAwesomeIcon />, path: 'prompts', color: { dark: '#dcdcaa', light: '#e65100' } },
  { label: 'Tools', icon: <BuildIcon />, path: 'tools', color: { dark: '#858585', light: '#616161' } },
  { label: 'Help', icon: <MenuBookIcon />, path: 'help', color: { dark: '#4ec9b0', light: '#00897b' } },
];

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  knowledge: 'Knowledge',
  tasks: 'Tasks',
  epics: 'Epics',
  skills: 'Skills',
  docs: 'Docs',
  code: 'Code',
  files: 'Files',
  search: 'Search',
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
  const [connectOpen, setConnectOpen] = useState(false);
  const [expandedNav, setExpandedNav] = useState<Set<string>>(new Set(['tasks']));
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
    const segment = location.pathname.split('/').slice(2).join('/') || 'dashboard';
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
          value={!loading && projects.some(p => p.id === projectId) ? projectId : ''}
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
        {NAV_ITEMS.filter(({ path }) => {
          const gn = NAV_GRAPH_MAP[path];
          if (!gn || !currentProject?.graphs) return true;
          const g = currentProject.graphs[gn];
          return g?.enabled !== false && g?.access !== 'deny';
        }).map((item) => {
          const { label, icon, path, children } = item;
          const segments = location.pathname.split('/').filter(Boolean);
          const currentPage = segments[1] || '';
          const currentSubPage = segments.slice(1).join('/');

          if (children) {
            const isExpanded = expandedNav.has(path);
            return (
              <Box key={path}>
                <ListItemButton
                  onClick={() => setExpandedNav(prev => {
                    const next = new Set(prev);
                    if (next.has(path)) next.delete(path); else next.add(path);
                    return next;
                  })}
                  disabled={!projectId}
                  sx={{ borderRadius: 1, mb: 0.5 }}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: item.color?.[mode] ?? 'inherit' }}>{icon}</ListItemIcon>
                  <ListItemText primary={label} />
                  {isExpanded ? <ExpandLess /> : <ExpandMore />}
                </ListItemButton>
                <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                  <List disablePadding>
                    {children.map((child) => {
                      const childActive = currentSubPage === child.path;
                      return (
                        <ListItemButton
                          key={child.path}
                          selected={childActive}
                          onClick={() => navigate(`/${projectId}/${child.path}`)}
                          disabled={!projectId}
                          sx={{
                            borderRadius: 1, mb: 0.25, pl: 4,
                            ...(childActive && {
                              bgcolor: 'primary.main',
                              color: palette.custom.textOnPrimary,
                              '&:hover': { bgcolor: 'primary.dark' },
                              '&.Mui-selected': {
                                bgcolor: 'primary.main',
                                color: palette.custom.textOnPrimary,
                                '&:hover': { bgcolor: 'primary.dark' },
                              },
                            }),
                          }}
                        >
                          <ListItemIcon sx={{ minWidth: 32, color: childActive ? palette.custom.textOnPrimary : (child.color?.[mode] ?? 'inherit') }}>
                            {child.icon}
                          </ListItemIcon>
                          <ListItemText primary={child.label} primaryTypographyProps={{ variant: 'body2' }} />
                        </ListItemButton>
                      );
                    })}
                  </List>
                </Collapse>
              </Box>
            );
          }

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
                  '&:hover': { bgcolor: 'primary.dark' },
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: palette.custom.textOnPrimary,
                    '&:hover': { bgcolor: 'primary.dark' },
                  },
                }),
              }}
            >
              <ListItemIcon sx={{ minWidth: 40, color: active ? palette.custom.textOnPrimary : (item.color?.[mode] ?? 'inherit') }}>
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
          {projectId && <WsStatusIndicator />}
          <Button
            variant="outlined"
            size="small"
            color="primary"
            startIcon={<CableIcon />}
            onClick={() => setConnectOpen(true)}
            disabled={!projectId}
            sx={{ textTransform: 'none', ml: 0.5 }}
          >
            Connect
          </Button>
          <IconButton color="inherit" onClick={toggle} title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}>
            {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
          </IconButton>
          <IconButton
            color="inherit"
            title="Sign out"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
              window.location.reload();
            }}
          >
            <LogoutIcon />
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
        <AccessProvider graphs={currentProject?.graphs ?? {}} loading={loading}>
          <WsProvider projectId={projectId ?? null}>
            <Outlet />
          </WsProvider>
        </AccessProvider>
      </Box>

      {projectId && (
        <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} projectId={projectId} />
      )}
    </Box>
  );
}
