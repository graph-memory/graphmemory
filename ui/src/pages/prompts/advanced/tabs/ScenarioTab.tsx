import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { ALL_GRAPHS, type GraphName } from '@/content/prompts/index.ts';
import { SCENARIOS, type ScenarioConfig } from '../../scenarios.tsx';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import type { GraphStats } from '../../prompt-builder.ts';

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
}
