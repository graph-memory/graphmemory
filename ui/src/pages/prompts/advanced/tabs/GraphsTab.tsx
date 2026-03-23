import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import { ALL_GRAPHS, GRAPH_LABELS } from '@/content/prompts/index.ts';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import type { GraphStats } from '../../prompt-builder.ts';
import SectionToggle from './SectionToggle.tsx';

interface GraphsTabProps {
  graphStats: GraphStats[];
}

export default function GraphsTab({ graphStats }: GraphsTabProps) {
  const { state, dispatch, ensureSectionEnabled } = useBuilderContext();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionToggle sectionId="graphs" label="Graphs" />
      <List dense disablePadding>
        {ALL_GRAPHS.map((name, i) => {
          const stat = graphStats.find(s => s.name === name);
          const count = stat?.nodeCount ?? 0;
          const enabled = !!state.graphs[name];
          return (
            <Box key={name}>
              {i > 0 && <Divider />}
              <ListItem
                disablePadding
                sx={{ py: 0.5, px: 1 }}
                secondaryAction={
                  <Switch
                    checked={enabled}
                    onChange={() => { dispatch({ type: 'TOGGLE_GRAPH', name }); ensureSectionEnabled('graphs'); }}
                    size="small"
                    inputProps={{ 'aria-label': `Toggle ${GRAPH_LABELS[name]} graph` }}
                  />
                }
              >
                <ListItemText
                  primary={
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {GRAPH_LABELS[name]}
                      <Chip label={count} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                    </Box>
                  }
                  secondary={enabled ? 'Included in prompt' : 'Excluded'}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: enabled ? 600 : 400, component: 'span' }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                  sx={{ opacity: enabled ? 1 : 0.5 }}
                />
              </ListItem>
            </Box>
          );
        })}
      </List>
    </Box>
  );
}
