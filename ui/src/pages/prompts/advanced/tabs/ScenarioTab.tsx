import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { ALL_GRAPHS, TOOL_CATALOG, type GraphName } from '@/content/prompts/index.ts';
import { SCENARIOS, type ScenarioConfig } from '../../scenarios.tsx';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import { createDefaultState } from '../defaults.ts';
import type { GraphStats } from '../../prompt-builder.ts';

interface ScenarioTabProps {
  graphStats: GraphStats[];
}

export default function ScenarioTab({ graphStats }: ScenarioTabProps) {
  const { state, dispatch } = useBuilderContext();

  const selectScenario = (scenario: ScenarioConfig) => {
    const defaults = createDefaultState();
    const adv = scenario.advancedDefaults;

    // Graphs — enable scenario defaults, disable unavailable
    const graphs = {} as Record<GraphName, boolean>;
    for (const g of ALL_GRAPHS) {
      const available = graphStats.find(s => s.name === g)?.available ?? false;
      graphs[g] = scenario.defaultGraphs.includes(g) && available;
    }

    // Tool configs — set focusTools as 'prefer', rest as 'available'
    const focusSet = new Set(scenario.focusTools);
    const toolConfigs = { ...defaults.toolConfigs };
    for (const name of Object.keys(TOOL_CATALOG)) {
      toolConfigs[name] = {
        priority: focusSet.has(name) ? 'prefer' : 'available',
        customInstructions: '',
      };
    }

    // Sections — always-on + scenario-specific
    const alwaysOn = new Set(['role', 'style', 'graphs', 'tools', 'workflow']);
    const scenarioSections = new Set(adv?.enableSections ?? []);
    const promptSections = defaults.promptSections.map(s => ({
      ...s,
      enabled: alwaysOn.has(s.id) || scenarioSections.has(s.id),
    }));

    const newState = {
      ...defaults,
      scenarioId: scenario.id,
      graphs,
      role: scenario.defaultRole,
      style: scenario.defaultStyle,
      toolConfigs,
      toolChains: [],
      workflow: [],
      customSections: [],
      promptSections,
      presetName: null,

      // Apply advanced defaults (merge with defaults)
      behavior: { ...defaults.behavior, ...adv?.behavior },
      memoryStrategy: { ...defaults.memoryStrategy, ...adv?.memoryStrategy },
      searchStrategy: { ...defaults.searchStrategy, ...adv?.searchStrategy },
      collaboration: { ...defaults.collaboration, ...adv?.collaboration },

      // Keep user's stack and project rules (project-specific, not scenario-specific)
      stack: state.stack,
      projectRules: state.projectRules,
      contextBudget: state.contextBudget,
    };

    dispatch({ type: 'LOAD_STATE', state: newState });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Scenario</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
        Applies a full preset: role, style, graphs, tool priorities, behavior, memory, search, collaboration, and enabled sections. Resets workflow and custom sections.
      </Typography>
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
}
