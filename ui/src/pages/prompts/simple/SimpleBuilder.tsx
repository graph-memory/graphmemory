import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import { MarkdownRenderer } from '@/shared/ui/index.ts';
import { getProjectStats } from '@/entities/project/index.ts';
import { createSkill } from '@/entities/skill/index.ts';
import {
  ALL_GRAPHS,
  type GraphName, type RoleName, type StyleName,
} from '@/content/prompts/index.ts';

const ROLE_OPTIONS: { value: RoleName; label: string; desc: string }[] = [
  { value: 'developer', label: 'Developer', desc: 'Write, debug, understand code' },
  { value: 'architect', label: 'Architect', desc: 'Design structure, evaluate patterns' },
  { value: 'reviewer', label: 'Reviewer', desc: 'Review changes for correctness' },
  { value: 'tech-writer', label: 'Tech Writer', desc: 'Write and maintain documentation' },
  { value: 'team-lead', label: 'Team Lead', desc: 'Manage tasks, track progress' },
  { value: 'devops', label: 'DevOps', desc: 'CI/CD, infra, deployment' },
  { value: 'data-analyst', label: 'Data Analyst', desc: 'Mine patterns, extract insights' },
  { value: 'onboarding-buddy', label: 'Onboarding Buddy', desc: 'Guide newcomers step by step' },
];

const STYLE_OPTIONS: { value: StyleName; label: string; desc: string }[] = [
  { value: 'proactive', label: 'Proactive', desc: 'Act without asking' },
  { value: 'reactive', label: 'Reactive', desc: 'Suggest, wait for approval' },
  { value: 'read-only', label: 'Read-only', desc: 'Search only, never mutate' },
  { value: 'balanced', label: 'Balanced', desc: 'Search freely, ask before changes' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Maximum automation' },
  { value: 'guided', label: 'Guided', desc: 'Explain every step' },
];
import { SCENARIOS, type ScenarioConfig } from '../scenarios.tsx';
import { buildPrompt, type BuilderState, type GraphStats } from '../prompt-builder.ts';
import GraphCards from './GraphCards.tsx';
import GraphRelationships from './GraphRelationships.tsx';
import TaskFlowDiagram from './TaskFlowDiagram.tsx';

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

export default function SimpleBuilder() {
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

  const showTaskFlow = enabledGraphs.includes('tasks');

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
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px 1fr' }, height: '100%', minHeight: 0 }}>

        {/* ── Left sidebar ── */}
        <Box sx={{
          borderRight: 1, borderColor: 'divider',
          overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column',
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

          {/* Role */}
          <Typography variant="overline" sx={{ px: 2, color: 'text.secondary' }}>
            Role
          </Typography>
          <List dense disablePadding sx={{ px: 1 }}>
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

          <Divider sx={{ my: 1 }} />

          {/* Style */}
          <Typography variant="overline" sx={{ px: 2, color: 'text.secondary' }}>
            Style
          </Typography>
          <List dense disablePadding sx={{ px: 1, pb: 1 }}>
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

        {/* ── Right main area ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

          {/* Action bar */}
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 1,
            px: 2, py: 1, borderBottom: 1, borderColor: 'divider',
          }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ flex: 1 }}>
              {enabledGraphs.length} graph{enabledGraphs.length !== 1 ? 's' : ''} enabled
              {prompt ? ` · ~${Math.ceil(prompt.length / 4)} tokens` : ''}
            </Typography>

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

          {/* Content area */}
          <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0, px: 3, py: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Graph Cards */}
            <GraphCards
              graphs={state.graphs}
              graphStats={graphStats}
              onToggle={toggleGraph}
            />

            {/* Graph Relationships */}
            {enabledGraphs.length > 1 && (
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                <GraphRelationships enabledGraphs={enabledGraphs} />
              </Box>
            )}

            {/* Task Flow Diagram */}
            {showTaskFlow && (
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                <TaskFlowDiagram />
              </Box>
            )}

            {/* Prompt Preview */}
            <Box>
              <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
                Generated Prompt
              </Typography>
              {prompt ? (
                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 2 }}>
                  <MarkdownRenderer>{prompt}</MarkdownRenderer>
                </Box>
              ) : (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  Enable at least one graph to generate a prompt
                </Typography>
              )}
            </Box>
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
