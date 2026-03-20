import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SaveIcon from '@mui/icons-material/Save';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import DownloadIcon from '@mui/icons-material/Download';
import CategoryIcon from '@mui/icons-material/Category';
import HubIcon from '@mui/icons-material/Hub';
import PersonIcon from '@mui/icons-material/Person';
import StyleIcon from '@mui/icons-material/Style';
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
import { createSkill } from '@/entities/skill/index.ts';
import { ALL_GRAPHS } from '@/content/prompts/index.ts';
import { SCENARIOS } from '../scenarios.tsx';
import { useGraphStats } from '../useGraphStats.ts';
import { BuilderProvider, useBuilderContext } from './context/BuilderContext.tsx';
import { createDefaultState } from './defaults.ts';
import { buildAdvancedPrompt } from './builder/buildPrompt.ts';
import { estimateTokens } from './builder/tokenEstimator.ts';
import { usePresets } from './hooks/usePresets.ts';
import ScenarioTab from './tabs/ScenarioTab.tsx';
import GraphsTab from './tabs/GraphsTab.tsx';
import RoleTab from './tabs/RoleTab.tsx';
import StyleTab from './tabs/StyleTab.tsx';
import StackTab from './tabs/StackTab.tsx';
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
  { label: 'Scenario', icon: <CategoryIcon fontSize="small" />, sectionId: null },
  { label: 'Graphs', icon: <HubIcon fontSize="small" />, sectionId: 'graphs' },
  { label: 'Role', icon: <PersonIcon fontSize="small" />, sectionId: 'role' },
  { label: 'Style', icon: <StyleIcon fontSize="small" />, sectionId: 'style' },
  { label: 'Stack', icon: <MemoryIcon fontSize="small" />, sectionId: 'stack' },
  { label: 'Tools', icon: <BuildIcon fontSize="small" />, sectionId: 'tools' },
  { label: 'Workflow', icon: <RouteIcon fontSize="small" />, sectionId: 'workflow' },
  { label: 'Behavior', icon: <TuneIcon fontSize="small" />, sectionId: 'behavior' },
  { label: 'Memory', icon: <PsychologyIcon fontSize="small" />, sectionId: 'memory' },
  { label: 'Search', icon: <SearchIcon fontSize="small" />, sectionId: 'search' },
  { label: 'Context', icon: <DataUsageIcon fontSize="small" />, sectionId: 'context' },
  { label: 'Rules', icon: <RuleIcon fontSize="small" />, sectionId: 'rules' },
  { label: 'Collab', icon: <GroupsIcon fontSize="small" />, sectionId: 'collaboration' },
  { label: 'Advanced', icon: <SettingsIcon fontSize="small" />, sectionId: null },
];

function AdvancedBuilderInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { state, dispatch } = useBuilderContext();

  const [activeTab, setActiveTab] = useState(0);
  const { graphStats, loading } = useGraphStats(projectId);
  const [skillTitle, setSkillTitle] = useState('');
  const [showExport, setShowExport] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const { presets, save: savePreset, load: loadPreset, remove: removePreset } = usePresets();
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });

  const prompt = useMemo(
    () => buildAdvancedPrompt(state, graphStats),
    [state, graphStats],
  );

  const tokens = useMemo(() => estimateTokens(prompt), [prompt]);
  const enabledSections = state.promptSections.filter(s => s.enabled).length;
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
        tags: ['prompt', 'advanced', state.scenarioId],
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

  const handleDownload = useCallback(() => {
    try {
      const blob = new Blob([prompt], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prompt-${state.scenarioId}.md`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setSnackbar({ open: true, message: 'Failed to download', severity: 'error' });
    }
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
      // Deep merge with defaults to handle fields added after the preset was saved
      const defaults = createDefaultState();
      // Merge promptSections: keep loaded order/enabled, but add any new default sections
      const loadedIds = new Set((loaded.promptSections ?? []).map(s => s.id));
      const mergedSections = [
        ...(loaded.promptSections ?? defaults.promptSections),
        ...defaults.promptSections.filter(s => !loadedIds.has(s.id)),
      ];
      const merged: typeof defaults = {
        ...defaults,
        ...loaded,
        graphs: { ...defaults.graphs, ...loaded.graphs },
        promptSections: mergedSections,
        stack: {
          enabledDomains: loaded.stack?.enabledDomains ?? defaults.stack.enabledDomains,
          selections: { ...defaults.stack.selections, ...loaded.stack?.selections },
        },
        behavior: { ...defaults.behavior, ...loaded.behavior },
        memoryStrategy: { ...defaults.memoryStrategy, ...loaded.memoryStrategy },
        searchStrategy: { ...defaults.searchStrategy, ...loaded.searchStrategy },
        contextBudget: { ...defaults.contextBudget, ...loaded.contextBudget },
        projectRules: { ...defaults.projectRules, ...loaded.projectRules },
        collaboration: { ...defaults.collaboration, ...loaded.collaboration },
        toolConfigs: { ...defaults.toolConfigs, ...loaded.toolConfigs },
      };
      dispatch({ type: 'LOAD_STATE', state: merged });
      setSnackbar({ open: true, message: `Preset "${name}" loaded`, severity: 'success' });
    }
  }, [loadPreset, dispatch]);

  if (loading) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }} aria-live="polite">
        <Typography color="text.secondary">Loading graph data…</Typography>
      </Box>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 0: return <ScenarioTab graphStats={graphStats} />;
      case 1: return <GraphsTab graphStats={graphStats} />;
      case 2: return <RoleTab />;
      case 3: return <StyleTab />;
      case 4: return <StackTab />;
      case 5: return <ToolsTab />;
      case 6: return <WorkflowTab />;
      case 7: return <BehaviorTab />;
      case 8: return <MemoryStrategyTab />;
      case 9: return <SearchStrategyTab />;
      case 10: return <ContextBudgetTab />;
      case 11: return <ProjectRulesTab />;
      case 12: return <CollaborationTab />;
      case 13: return <AdvancedTab />;
      default: return null;
    }
  };

  return (
    <>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

        {/* ── Top: Tab bar (full width, wrapping) ── */}
        <Box role="tablist" aria-label="Prompt builder sections" sx={{
          display: 'flex', flexWrap: 'wrap', gap: 0.25,
          borderBottom: 1, borderColor: 'divider',
          px: 0.5, pt: 0.5, flexShrink: 0,
        }}>
          {TAB_CONFIG.map((tab, i) => {
            const included = tab.sectionId
              ? state.promptSections.find(s => s.id === tab.sectionId)?.enabled ?? false
              : true;
            const active = activeTab === i;
            return (
              <Box
                key={tab.label}
                role="tab"
                tabIndex={0}
                aria-selected={active}
                aria-label={`${tab.label} tab${included ? '' : ' (excluded from prompt)'}`}
                aria-controls="builder-tab-panel"
                onClick={() => setActiveTab(i)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActiveTab(i); } }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.5,
                  px: 1.5, py: 0.75, cursor: 'pointer',
                  fontSize: '0.75rem',
                  borderBottom: 2,
                  borderColor: active ? 'primary.main' : 'transparent',
                  color: included ? 'primary.main' : 'text.disabled',
                  '&:hover': { color: 'primary.main' },
                }}
              >
                {tab.icon}
                {tab.label}
              </Box>
            );
          })}
        </Box>

        {/* ── Main: Config sidebar + Preview ── */}
        <Box sx={{ flex: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '360px 1fr' }, minHeight: 0 }}>

          {/* Left: Tab content */}
          <Box id="builder-tab-panel" role="tabpanel" sx={{ borderRight: 1, borderColor: 'divider', overflowY: 'auto', overflowX: 'hidden', minHeight: 0, p: 2 }}>
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
              {tokens > 8000 && (
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
                onChange={e => { if (e.target.value) { setShowExport(false); setShowSavePreset(false); setConfirmLoad(e.target.value as string); } }}
                sx={{ height: 28, fontSize: '0.75rem', minWidth: 120 }}
                renderValue={() => 'Load preset...'}
                aria-label="Load preset"
              >
                {presets.map(p => (
                  <MenuItem key={p.name} value={p.name} sx={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <span>{p.name}</span>
                    <IconButton
                      size="small"
                      aria-label={`Delete preset ${p.name}`}
                      onClick={e => {
                        e.stopPropagation();
                        setConfirmDelete(p.name);
                      }}
                      sx={{ p: 0.25, opacity: 0.5, '&:hover': { opacity: 1 }, fontSize: '0.65rem' }}
                    >
                      ✕
                    </IconButton>
                  </MenuItem>
                ))}
              </Select>
            )}

              <Box sx={{ display: 'flex', gap: 0.5 }}>
                <Tooltip title="Copy to clipboard">
                  <span>
                    <IconButton onClick={handleCopy} disabled={!prompt} size="small" aria-label="Copy prompt to clipboard">
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Download as .md">
                  <span>
                    <IconButton onClick={handleDownload} disabled={!prompt} size="small" aria-label="Download prompt as markdown">
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Save preset">
                  <span>
                    <IconButton onClick={() => { setShowExport(false); setShowSavePreset(true); }} size="small" aria-label="Save as preset">
                      <BookmarkBorderIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Export as Skill">
                  <span>
                    <IconButton
                      onClick={() => {
                        setShowSavePreset(false);
                        setSkillTitle(`Prompt: ${selectedScenario?.label ?? 'Custom'} (Advanced)`);
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

      {/* Save Preset Dialog */}
      <Dialog open={showSavePreset} onClose={() => setShowSavePreset(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Save Preset</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Save current configuration as a preset. Presets are stored in your browser's local storage.
          </Typography>
          <TextField
            size="small"
            label="Preset name"
            placeholder="e.g. My Development Setup"
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && presetName.trim()) handleSavePreset(); }}
            fullWidth
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSavePreset(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSavePreset} disabled={!presetName.trim()}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Export as Skill Dialog */}
      <Dialog open={showExport} onClose={() => setShowExport(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Export as Skill</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Save the generated prompt as a skill in the project's Skill Graph. It will be searchable via <code>recall_skills</code>.
          </Typography>
          <TextField
            size="small"
            label="Skill title"
            placeholder="e.g. Prompt: Development (Advanced)"
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

      {/* Confirm Load Preset Dialog */}
      <Dialog open={!!confirmLoad} onClose={() => setConfirmLoad(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Load Preset</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Loading preset <strong>{confirmLoad}</strong> will replace all current settings. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmLoad(null)}>Cancel</Button>
          <Button variant="contained" onClick={() => { if (confirmLoad) handleLoadPreset(confirmLoad); setConfirmLoad(null); }}>Load</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Delete Preset Dialog */}
      <Dialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Delete Preset</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete preset <strong>{confirmDelete}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={() => {
            if (confirmDelete) {
              removePreset(confirmDelete);
              setSnackbar({ open: true, message: `Preset "${confirmDelete}" deleted`, severity: 'success' });
            }
            setConfirmDelete(null);
          }}>Delete</Button>
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

export default function AdvancedBuilder() {
  return (
    <BuilderProvider>
      <AdvancedBuilderInner />
    </BuilderProvider>
  );
}
