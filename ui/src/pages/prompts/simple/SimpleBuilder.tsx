import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import CategoryIcon from '@mui/icons-material/Category';
import HubIcon from '@mui/icons-material/Hub';
import PersonIcon from '@mui/icons-material/Person';
import StyleIcon from '@mui/icons-material/Style';
import { MarkdownRenderer } from '@/shared/ui/index.ts';
import { createSkill } from '@/entities/skill/index.ts';
import {
  ALL_GRAPHS,
  ROLE_OPTIONS, STYLE_OPTIONS,
  type GraphName,
} from '@/content/prompts/index.ts';
import { SCENARIOS, type ScenarioConfig } from '../scenarios.tsx';
import { buildPrompt, type BuilderState } from '../prompt-builder.ts';
import { useGraphStats } from '../useGraphStats.ts';
import GraphCards from './GraphCards.tsx';
import GraphRelationships from './GraphRelationships.tsx';

const DEFAULT_SCENARIO = SCENARIOS[0];

const TAB_CONFIG = [
  { label: 'Scenario', icon: <CategoryIcon fontSize="small" /> },
  { label: 'Graphs', icon: <HubIcon fontSize="small" /> },
  { label: 'Role', icon: <PersonIcon fontSize="small" /> },
  { label: 'Style', icon: <StyleIcon fontSize="small" /> },
];

function initState(scenario: ScenarioConfig): BuilderState {
  const graphs = {} as Record<GraphName, boolean>;
  for (const g of ALL_GRAPHS) {
    graphs[g] = scenario.defaultGraphs.includes(g);
  }
  return {
    scenarioId: scenario.id,
    graphs,
    role: scenario.defaultRole,
    style: scenario.defaultStyle,
  };
}

export default function SimpleBuilder() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<BuilderState>(() => initState(DEFAULT_SCENARIO));
  const { graphStats, loading } = useGraphStats(projectId);

  const [activeTab, setActiveTab] = useState(0);
  const [skillTitle, setSkillTitle] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  const selectScenario = useCallback((scenario: ScenarioConfig) => {
    setState(initState(scenario));
  }, [graphStats]);

  const toggleGraph = useCallback((name: GraphName) => {
    setState(prev => ({ ...prev, graphs: { ...prev.graphs, [name]: !prev.graphs[name] } }));
  }, []);

  const scenarioFocusTools = useMemo(
    () => SCENARIOS.find(s => s.id === state.scenarioId)?.focusTools ?? [],
    [state.scenarioId],
  );
  const prompt = useMemo(
    () => buildPrompt(state, graphStats, scenarioFocusTools),
    [state, graphStats, scenarioFocusTools],
  );

  const enabledGraphs = useMemo(
    () => ALL_GRAPHS.filter(g => state.graphs[g]),
    [state.graphs, graphStats],
  );

  const selectedScenario = SCENARIOS.find(s => s.id === state.scenarioId);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setSnackbar({ open: true, message: 'Copied to clipboard', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to copy', severity: 'error' });
    }
  }, [prompt]);

  const handleExport = useCallback(async () => {
    if (!projectId || !skillTitle.trim()) return;
    try {
      const skill = await createSkill(projectId, {
        title: skillTitle.trim(),
        description: prompt,
        steps: [],
        triggers: selectedScenario?.triggers ?? [],
        tags: ['prompt', state.scenarioId],
        source: 'user',
      });
      if (!skill?.id) throw new Error('Invalid response from server');
      setSnackbar({ open: true, message: 'Skill created', severity: 'success' });
      setShowExport(false);
      setSkillTitle('');
      navigate(`/${projectId}/skills/${skill.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create skill';
      setSnackbar({ open: true, message, severity: 'error' });
    }
  }, [projectId, skillTitle, prompt, state.scenarioId, selectedScenario, navigate]);

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }} aria-live="polite">
        <Typography color="text.secondary">Loading graph data…</Typography>
      </Box>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 0:
        return (
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>Scenario</Typography>
            <List dense disablePadding>
              {SCENARIOS.map(scenario => {
                const selected = state.scenarioId === scenario.id;
                return (
                  <ListItemButton
                    key={scenario.id}
                    selected={selected}
                    onClick={() => selectScenario(scenario)}
                    sx={{ borderRadius: 1, mb: 0.25 }}
                  >
                    <ListItemIcon sx={{ minWidth: 32, color: selected ? 'primary.main' : 'text.secondary' }}>
                      {scenario.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={scenario.label}
                      secondary={scenario.description}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { lineHeight: 1.2 } }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        );

      case 1:
        return (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>Graphs</Typography>
            <GraphCards graphs={state.graphs} graphStats={graphStats} onToggle={toggleGraph} />
            {enabledGraphs.length > 1 && (
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                <GraphRelationships enabledGraphs={enabledGraphs} />
              </Box>
            )}
          </Box>
        );

      case 2:
        return (
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>Role</Typography>
            <List dense disablePadding>
              {ROLE_OPTIONS.map(opt => {
                const selected = state.role === opt.value;
                return (
                  <ListItemButton
                    key={opt.value}
                    selected={selected}
                    onClick={() => setState(prev => ({ ...prev, role: opt.value }))}
                    sx={{ borderRadius: 1, mb: 0.25 }}
                  >
                    <ListItemText
                      primary={opt.label}
                      secondary={opt.desc}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { lineHeight: 1.2 } }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        );

      case 3:
        return (
          <Box>
            <Typography variant="overline" sx={{ color: 'text.secondary' }}>Style</Typography>
            <List dense disablePadding>
              {STYLE_OPTIONS.map(opt => {
                const selected = state.style === opt.value;
                return (
                  <ListItemButton
                    key={opt.value}
                    selected={selected}
                    onClick={() => setState(prev => ({ ...prev, style: opt.value }))}
                    sx={{ borderRadius: 1, mb: 0.25 }}
                  >
                    <ListItemText
                      primary={opt.label}
                      secondary={opt.desc}
                      primaryTypographyProps={{ variant: 'body2' }}
                      secondaryTypographyProps={{ variant: 'caption', sx: { lineHeight: 1.2 } }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

        {/* Tab bar */}
        <Box role="tablist" aria-label="Simple builder sections" sx={{
          display: 'flex', flexWrap: 'wrap', gap: 0.25,
          borderBottom: 1, borderColor: 'divider',
          px: 0.5, pt: 0.5, flexShrink: 0,
        }}>
          {TAB_CONFIG.map((tab, i) => {
            const active = activeTab === i;
            return (
              <Box
                key={tab.label}
                role="tab"
                tabIndex={0}
                aria-selected={active}
                aria-label={`${tab.label} tab`}
                aria-controls="simple-tab-panel"
                onClick={() => setActiveTab(i)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(i); } }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  px: 1.5, py: 0.75, cursor: 'pointer',
                  fontSize: '0.75rem',
                  borderBottom: 2,
                  borderColor: active ? 'primary.main' : 'transparent',
                  color: active ? 'primary.main' : 'text.secondary',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                {tab.icon}
                {tab.label}
              </Box>
            );
          })}
        </Box>

        {/* Main: sidebar + preview */}
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '360px 1fr' }, minHeight: 0 }}>

          {/* Left: tab content */}
          <Box id="simple-tab-panel" role="tabpanel" sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto', overflowX: 'hidden', minHeight: 0, p: 2 }}>
            {renderTabContent()}
          </Box>

          {/* Right: preview */}
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

            {/* Stats + actions bar */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              px: 2, py: 1, borderBottom: 1, borderColor: 'divider',
            }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ flex: 1 }}>
                {enabledGraphs.length} graph{enabledGraphs.length !== 1 ? 's' : ''} enabled
                {prompt ? ` · ~${Math.ceil(prompt.length / 4)} tokens` : ''}
              </Typography>

              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title="Copy to clipboard">
                  <span>
                    <IconButton onClick={handleCopy} disabled={!prompt} size="small" aria-label="Copy prompt to clipboard">
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Export as Skill">
                  <span>
                    <IconButton
                      onClick={() => {
                        setSkillTitle(`Prompt: ${selectedScenario?.label ?? 'Custom'}`);
                        setShowExport(true);
                      }}
                      disabled={!prompt}
                      size="small"
                      aria-label="Export prompt as skill"
                    >
                      <SaveIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>

            {/* Preview */}
            <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, px: 3, py: 2 }}>
              {prompt ? (
                <MarkdownRenderer>{prompt}</MarkdownRenderer>
              ) : (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  Enable at least one graph to generate a prompt
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Export as Skill Dialog */}
      <Dialog open={showExport} onClose={() => setShowExport(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Export as Skill</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Save the generated prompt as a skill in the project's Skill Graph.
          </Typography>
          <TextField
            size="small"
            label="Skill title"
            placeholder="e.g. Prompt: Development"
            value={skillTitle}
            onChange={e => setSkillTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && skillTitle.trim()) handleExport(); }}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowExport(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleExport} disabled={!skillTitle.trim()}>Export</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
