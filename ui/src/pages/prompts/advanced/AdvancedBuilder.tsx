import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import DownloadIcon from '@mui/icons-material/Download';
import CategoryIcon from '@mui/icons-material/Category';
import MemoryIcon from '@mui/icons-material/Memory';
import BuildIcon from '@mui/icons-material/Build';
import RouteIcon from '@mui/icons-material/Route';
import TuneIcon from '@mui/icons-material/Tune';
import PsychologyIcon from '@mui/icons-material/Psychology';
import SearchIcon from '@mui/icons-material/Search';
import DataUsageIcon from '@mui/icons-material/DataUsage';
import RuleIcon from '@mui/icons-material/Rule';
import GroupsIcon from '@mui/icons-material/Groups';
import SettingsIcon from '@mui/icons-material/Settings';
import { MarkdownRenderer } from '@/shared/ui/index.ts';
import { getProjectStats } from '@/entities/project/index.ts';
import { createSkill } from '@/entities/skill/index.ts';
import { ALL_GRAPHS } from '@/content/prompts/index.ts';
import { SCENARIOS } from '../scenarios.tsx';
import type { GraphStats } from '../prompt-builder.ts';
import { BuilderProvider, useBuilderContext } from './context/BuilderContext.tsx';
import { buildAdvancedPrompt } from './builder/buildPrompt.ts';
import { estimateTokens } from './builder/tokenEstimator.ts';
import { usePresets } from './hooks/usePresets.ts';
import ScenarioTab from './tabs/ScenarioTab.tsx';
import TechStackTab from './tabs/TechStackTab.tsx';
import ToolsTab from './tabs/ToolsTab.tsx';
import WorkflowTab from './tabs/WorkflowTab.tsx';
import BehaviorTab from './tabs/BehaviorTab.tsx';
import MemoryStrategyTab from './tabs/MemoryStrategyTab.tsx';
import SearchStrategyTab from './tabs/SearchStrategyTab.tsx';
import ContextBudgetTab from './tabs/ContextBudgetTab.tsx';
import ProjectRulesTab from './tabs/ProjectRulesTab.tsx';
import CollaborationTab from './tabs/CollaborationTab.tsx';
import AdvancedTab from './tabs/AdvancedTab.tsx';

const TAB_CONFIG = [
  { label: 'Scenario', icon: <CategoryIcon fontSize="small" /> },
  { label: 'Tech Stack', icon: <MemoryIcon fontSize="small" /> },
  { label: 'Tools', icon: <BuildIcon fontSize="small" /> },
  { label: 'Workflow', icon: <RouteIcon fontSize="small" /> },
  { label: 'Behavior', icon: <TuneIcon fontSize="small" /> },
  { label: 'Memory', icon: <PsychologyIcon fontSize="small" /> },
  { label: 'Search', icon: <SearchIcon fontSize="small" /> },
  { label: 'Context', icon: <DataUsageIcon fontSize="small" /> },
  { label: 'Rules', icon: <RuleIcon fontSize="small" /> },
  { label: 'Collab', icon: <GroupsIcon fontSize="small" /> },
  { label: 'Advanced', icon: <SettingsIcon fontSize="small" /> },
];

function AdvancedBuilderInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useBuilderContext();

  const [activeTab, setActiveTab] = useState(0);
  const [graphStats, setGraphStats] = useState<GraphStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [skillTitle, setSkillTitle] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const { presets, save: savePreset, load: loadPreset } = usePresets();
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

  const prompt = useMemo(
    () => buildAdvancedPrompt(state, graphStats),
    [state, graphStats],
  );

  const tokens = useMemo(() => estimateTokens(prompt), [prompt]);
  const enabledSections = state.promptSections.filter(s => s.enabled).length;
  const enabledGraphs = ALL_GRAPHS.filter(g => state.graphs[g] && graphStats.find(s => s.name === g)?.available);

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
        tags: ['prompt', 'advanced', state.scenarioId],
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

  const handleDownload = useCallback(() => {
    const blob = new Blob([prompt], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-${state.scenarioId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [prompt, state.scenarioId]);

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return;
    savePreset(presetName.trim(), state);
    setSnackbar({ open: true, message: `Preset "${presetName}" saved`, severity: 'success' });
    setShowSavePreset(false);
    setPresetName('');
  }, [presetName, savePreset, state]);

  const handleLoadPreset = useCallback((name: string) => {
    const loaded = loadPreset(name);
    if (loaded) {
      dispatch({ type: 'LOAD_STATE', state: loaded });
      setSnackbar({ open: true, message: `Preset "${name}" loaded`, severity: 'success' });
    }
  }, [loadPreset, dispatch]);

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography color="text.secondary">Loading...</Typography>
      </Box>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 0: return <ScenarioTab graphStats={graphStats} />;
      case 1: return <TechStackTab />;
      case 2: return <ToolsTab />;
      case 3: return <WorkflowTab />;
      case 4: return <BehaviorTab />;
      case 5: return <MemoryStrategyTab />;
      case 6: return <SearchStrategyTab />;
      case 7: return <ContextBudgetTab />;
      case 8: return <ProjectRulesTab />;
      case 9: return <CollaborationTab />;
      case 10: return <AdvancedTab />;
      default: return null;
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

        {/* ── Top: Tab bar (full width, wrapping) ── */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            minHeight: 36,
            flexShrink: 0,
            '& .MuiTabs-flexContainer': { flexWrap: 'wrap' },
            '& .MuiTab-root': {
              minHeight: 36,
              minWidth: 'auto',
              px: 1.5,
              textTransform: 'none',
              fontSize: '0.75rem',
            },
          }}
        >
          {TAB_CONFIG.map(tab => (
            <Tab key={tab.label} icon={tab.icon} label={tab.label} iconPosition="start" />
          ))}
        </Tabs>

        {/* ── Main: Config sidebar + Preview ── */}
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '360px 1fr' }, minHeight: 0 }}>

          {/* Left: Tab content */}
          <Box sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto', overflowX: 'hidden', minHeight: 0, p: 2 }}>
            {renderTabContent()}
          </Box>

          {/* Right: Preview Panel */}
          <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

            {/* Stats + actions bar */}
            <Box sx={{
              display: 'flex', alignItems: 'center', gap: 1,
              px: 2, py: 1, borderBottom: 1, borderColor: 'divider',
            }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
              ~{tokens} tok
            </Typography>
            <Typography variant="caption" color="text.secondary">·</Typography>
            <Typography variant="caption" color="text.secondary">
              {enabledSections} sections
            </Typography>
            <Typography variant="caption" color="text.secondary">·</Typography>
            <Typography variant="caption" color="text.secondary">
              {enabledGraphs.length} graphs
            </Typography>

            {tokens > 4000 && (
              <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
                (large prompt)
              </Typography>
            )}

            <Box sx={{ flex: 1 }} />

            {/* Preset selector */}
            {presets.length > 0 && (
              <Select
                size="small"
                value=""
                displayEmpty
                onChange={e => { if (e.target.value) handleLoadPreset(e.target.value); }}
                sx={{ height: 28, fontSize: '0.75rem', minWidth: 120 }}
                renderValue={() => 'Load preset...'}
              >
                {presets.map(p => (
                  <MenuItem key={p.name} value={p.name} sx={{ fontSize: '0.75rem' }}>{p.name}</MenuItem>
                ))}
              </Select>
            )}

            {showSavePreset ? (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <TextField
                  size="small"
                  placeholder="Preset name"
                  value={presetName}
                  onChange={e => setPresetName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSavePreset();
                    if (e.key === 'Escape') setShowSavePreset(false);
                  }}
                  autoFocus
                  sx={{ width: 140, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.75rem' } }}
                />
                <Button size="small" variant="contained" onClick={handleSavePreset} disabled={!presetName.trim()}>Save</Button>
                <Button size="small" onClick={() => setShowSavePreset(false)}>Cancel</Button>
              </Box>
            ) : showExport ? (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
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
                <Button variant="contained" size="small" onClick={handleExport} disabled={!skillTitle.trim()}>Save</Button>
                <Button size="small" onClick={() => setShowExport(false)}>Cancel</Button>
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
                <Tooltip title="Download as .md">
                  <span>
                    <IconButton onClick={handleDownload} disabled={!prompt} size="small">
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Save preset">
                  <span>
                    <IconButton onClick={() => setShowSavePreset(true)} size="small">
                      <BookmarkBorderIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Export as Skill">
                  <span>
                    <IconButton
                      onClick={() => {
                        setSkillTitle(`Prompt: ${selectedScenario?.label ?? 'Custom'} (Advanced)`);
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

export default function AdvancedBuilder() {
  return (
    <BuilderProvider>
      <AdvancedBuilderInner />
    </BuilderProvider>
  );
}
