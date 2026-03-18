import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Chip from '@mui/material/Chip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CodeIcon from '@mui/icons-material/Code';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import { PageTopBar, MarkdownRenderer } from '@/shared/ui/index.ts';
import { getProjectStats } from '@/entities/project/index.ts';
import { createSkill } from '@/entities/skill/index.ts';
import {
  ALL_GRAPHS, GRAPH_LABELS, ROLE_LABELS, STYLE_LABELS,
  type GraphName, type RoleName, type StyleName,
} from '@/content/prompts/index.ts';
import { SCENARIOS, type ScenarioConfig } from './scenarios.tsx';
import { buildPrompt, type BuilderState, type GraphStats } from './prompt-builder.ts';

const GRAPH_ICONS: Record<GraphName, { icon: React.ReactElement; color: string }> = {
  docs: { icon: <DescriptionOutlinedIcon />, color: '#ef5350' },
  code: { icon: <CodeIcon />, color: '#42a5f5' },
  files: { icon: <FolderOutlinedIcon />, color: '#66bb6a' },
  knowledge: { icon: <LightbulbOutlinedIcon />, color: '#ffc107' },
  tasks: { icon: <AssignmentOutlinedIcon />, color: '#7c4dff' },
  skills: { icon: <PsychologyOutlinedIcon />, color: '#ff7043' },
};

const DEFAULT_SCENARIO = SCENARIOS[0];

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

export default function PromptsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<BuilderState>(() => initState(DEFAULT_SCENARIO));
  const [graphStats, setGraphStats] = useState<GraphStats[]>([]);
  const [loading, setLoading] = useState(true);

  const [skillTitle, setSkillTitle] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    getProjectStats(projectId)
      .then(stats => {
        const s = stats as unknown as Record<string, { nodes: number; edges: number } | null>;
        setGraphStats([
          { name: 'docs', nodeCount: s.docs?.nodes ?? 0, available: (s.docs?.nodes ?? 0) > 0 },
          { name: 'code', nodeCount: s.code?.nodes ?? 0, available: (s.code?.nodes ?? 0) > 0 },
          { name: 'files', nodeCount: s.fileIndex?.nodes ?? 0, available: (s.fileIndex?.nodes ?? 0) > 0 },
          { name: 'knowledge', nodeCount: s.knowledge?.nodes ?? 0, available: (s.knowledge?.nodes ?? 0) > 0 },
          { name: 'tasks', nodeCount: s.tasks?.nodes ?? 0, available: (s.tasks?.nodes ?? 0) > 0 },
          { name: 'skills', nodeCount: s.skills?.nodes ?? 0, available: (s.skills?.nodes ?? 0) > 0 },
        ]);
      })
      .catch(() => {
        setGraphStats(ALL_GRAPHS.map(name => ({ name, nodeCount: 0, available: false })));
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  const selectScenario = useCallback((scenario: ScenarioConfig) => {
    const newState = initState(scenario);
    for (const g of ALL_GRAPHS) {
      const stat = graphStats.find(s => s.name === g);
      if (stat && !stat.available) newState.graphs[g] = false;
    }
    setState(newState);
    setSkillTitle(`Prompt: ${scenario.label}`);
    setShowExport(false);
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
    () => ALL_GRAPHS.filter(g => state.graphs[g] && graphStats.find(s => s.name === g)?.available),
    [state.graphs, graphStats],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setSnackbar({ open: true, message: 'Copied to clipboard', severity: 'success' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to copy', severity: 'error' });
    }
  }, [prompt]);

  const selectedScenario = SCENARIOS.find(s => s.id === state.scenarioId);

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
      setSnackbar({ open: true, message: 'Skill created', severity: 'success' });
      setShowExport(false);
      navigate(`/${projectId}/skills/${skill.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create skill';
      setSnackbar({ open: true, message, severity: 'error' });
    }
  }, [projectId, skillTitle, prompt, state.scenarioId, selectedScenario, navigate]);

  if (loading) {
    return (
      <>
        <PageTopBar breadcrumbs={[{ label: 'Prompts' }]} />
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="text.secondary">Loading...</Typography>
        </Box>
      </>
    );
  }

  return (
    <>
      <PageTopBar breadcrumbs={[{ label: 'Prompts' }]} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px 1fr' }, height: 'calc(100vh - 120px)' }}>

        {/* ── Left sidebar ── */}
        <Box sx={{
          borderRight: 1, borderColor: 'divider',
          overflowY: 'auto', display: 'flex', flexDirection: 'column',
        }}>
          {/* Scenarios */}
          <Typography variant="overline" sx={{ px: 2, pt: 1.5, color: 'text.secondary' }}>
            Scenario
          </Typography>
          <List dense disablePadding sx={{ px: 1 }}>
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
                    primaryTypographyProps={{ variant: 'body2' }}
                  />
                </ListItemButton>
              );
            })}
          </List>

          <Divider sx={{ my: 1 }} />

          {/* Graphs */}
          <Typography variant="overline" sx={{ px: 2, color: 'text.secondary' }}>
            Graphs
          </Typography>
          <FormGroup sx={{ px: 2, pb: 1 }}>
            {ALL_GRAPHS.map(name => {
              const stat = graphStats.find(s => s.name === name);
              const available = stat?.available ?? false;
              const count = stat?.nodeCount ?? 0;
              return (
                <FormControlLabel
                  key={name}
                  control={
                    <Checkbox
                      checked={state.graphs[name] && available}
                      disabled={!available}
                      onChange={() => toggleGraph(name)}
                      size="small"
                    />
                  }
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography variant="body2">{GRAPH_LABELS[name]}</Typography>
                      <Chip
                        label={available ? count : 'n/a'}
                        size="small"
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.7rem' }}
                      />
                    </Box>
                  }
                  sx={{ ml: 0, mr: 0 }}
                />
              );
            })}
          </FormGroup>

          <Divider sx={{ my: 1 }} />

          {/* Role & Style */}
          <Box sx={{ px: 2, pb: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>Role</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <Chip
                    key={value}
                    label={label}
                    size="small"
                    onClick={() => setState(prev => ({ ...prev, role: value as RoleName }))}
                    sx={state.role === value
                      ? { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' }, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }
                      : { opacity: 0.5, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }
                    }
                  />
                ))}
              </Box>
            </Box>
            <Box>
              <Typography variant="overline" sx={{ color: 'text.secondary' }}>Style</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
                {Object.entries(STYLE_LABELS).map(([value, label]) => (
                  <Chip
                    key={value}
                    label={label}
                    size="small"
                    onClick={() => setState(prev => ({ ...prev, style: value as StyleName }))}
                    sx={state.style === value
                      ? { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' }, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }
                      : { opacity: 0.5, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }
                    }
                  />
                ))}
              </Box>
            </Box>
          </Box>



        </Box>

        {/* ── Right main area ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

          {/* Top bar: mascot + graph icons + actions */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 2, py: 1, borderBottom: 1, borderColor: 'divider',
          }}>
            {/* Graph tech icons */}
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {ALL_GRAPHS.map(name => {
                const active = enabledGraphs.includes(name);
                const { icon, color } = GRAPH_ICONS[name];
                return (
                  <Tooltip key={name} title={GRAPH_LABELS[name]}>
                    <Box sx={{
                      p: 0.5,
                      borderRadius: 1,
                      color: active ? color : 'action.disabled',
                      bgcolor: active ? `${color}18` : 'transparent',
                      opacity: active ? 1 : 0.3,
                      transition: 'all 300ms',
                      display: 'flex',
                    }}>
                      {icon}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>

            <Box sx={{ flex: 1 }} />

            {/* Actions */}
            {showExport ? (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField
                  size="small"
                  placeholder="Skill title"
                  value={skillTitle}
                  onChange={e => setSkillTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleExport();
                    if (e.key === 'Escape') setShowExport(false);
                  }}
                  autoFocus
                  sx={{ width: 200 }}
                />
                <Button variant="contained" size="small" onClick={handleExport} disabled={!skillTitle.trim()}>
                  Save
                </Button>
                <Button size="small" onClick={() => setShowExport(false)}>
                  Cancel
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title="Copy to clipboard">
                  <span>
                    <IconButton onClick={handleCopy} disabled={!prompt} size="small">
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
                    >
                      <SaveIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            )}
          </Box>

          {/* Preview */}
          <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
            {prompt ? (
              <MarkdownRenderer>{prompt}</MarkdownRenderer>
            ) : (
              <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                Select at least one graph to generate a prompt
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
