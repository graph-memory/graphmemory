import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import ListItem from '@mui/material/ListItem';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import {
  ALL_GRAPHS, GRAPH_LABELS,
  type GraphName, type RoleName, type StyleName,
} from '@/content/prompts/index.ts';
import { SCENARIOS, type ScenarioConfig } from '../../scenarios.tsx';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import type { GraphStats } from '../../prompt-builder.ts';

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

interface ScenarioTabProps {
  graphStats: GraphStats[];
}

export default function ScenarioTab({ graphStats }: ScenarioTabProps) {
  const { state, dispatch } = useBuilderContext();

  const selectScenario = (scenario: ScenarioConfig) => {
    dispatch({ type: 'SET_SCENARIO', scenarioId: scenario.id });
    dispatch({ type: 'SET_ROLE', role: scenario.defaultRole });
    dispatch({ type: 'SET_STYLE', style: scenario.defaultStyle });
    const graphs = {} as Record<GraphName, boolean>;
    for (const g of ALL_GRAPHS) {
      const stat = graphStats.find(s => s.name === g);
      const available = stat?.available ?? false;
      graphs[g] = scenario.defaultGraphs.includes(g) && available;
    }
    dispatch({ type: 'SET_GRAPHS', graphs });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Scenarios */}
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

      <Divider />

      {/* Graphs */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Graphs</Typography>
      <List dense disablePadding>
        {ALL_GRAPHS.map((name, i) => {
          const stat = graphStats.find(s => s.name === name);
          const available = stat?.available ?? false;
          const count = stat?.nodeCount ?? 0;
          const enabled = state.graphs[name] && available;
          return (
            <Box key={name}>
              {i > 0 && <Divider />}
              <ListItem
                disablePadding
                sx={{ py: 0.5, px: 1 }}
                secondaryAction={
                  <Switch
                    checked={enabled}
                    disabled={!available}
                    onChange={() => dispatch({ type: 'TOGGLE_GRAPH', name })}
                    size="small"
                  />
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {GRAPH_LABELS[name]}
                      <Chip label={available ? count : 'n/a'} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                    </Box>
                  }
                  secondary={enabled ? 'Included in prompt' : available ? 'Excluded' : 'Not indexed'}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: enabled ? 600 : 400 }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                  sx={{ opacity: enabled ? 1 : 0.5 }}
                />
              </ListItem>
            </Box>
          );
        })}
      </List>

      <Divider />

      {/* Role */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Role</Typography>
      <List dense disablePadding>
        {ROLE_OPTIONS.map(opt => (
          <ListItemButton
            key={opt.value}
            selected={state.role === opt.value}
            onClick={() => dispatch({ type: 'SET_ROLE', role: opt.value })}
            sx={{ borderRadius: 1, mb: 0.25 }}
          >
            <ListItemText
              primary={opt.label}
              secondary={opt.desc}
              primaryTypographyProps={{ variant: 'body2' }}
              secondaryTypographyProps={{ variant: 'caption', sx: { lineHeight: 1.2 } }}
            />
          </ListItemButton>
        ))}
      </List>

      <Divider />

      {/* Style */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Style</Typography>
      <List dense disablePadding>
        {STYLE_OPTIONS.map(opt => (
          <ListItemButton
            key={opt.value}
            selected={state.style === opt.value}
            onClick={() => dispatch({ type: 'SET_STYLE', style: opt.value })}
            sx={{ borderRadius: 1, mb: 0.25 }}
          >
            <ListItemText
              primary={opt.label}
              secondary={opt.desc}
              primaryTypographyProps={{ variant: 'body2' }}
              secondaryTypographyProps={{ variant: 'caption', sx: { lineHeight: 1.2 } }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
