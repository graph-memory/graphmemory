import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import { useBuilderContext } from '../context/BuilderContext.tsx';

export default function AdvancedTab() {
  const { state, dispatch } = useBuilderContext();

  const sections = [...state.promptSections].sort((a, b) => a.weight - b.weight);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Prompt Sections</Typography>

      <Typography variant="caption" color="text.secondary">
        Toggle sections on/off to control what appears in the generated prompt.
        Enabled sections are assembled in the order shown below.
      </Typography>

      <List dense disablePadding>
        {sections.map((section, i) => (
          <Box key={section.id}>
            {i > 0 && <Divider />}
            <ListItem
              disablePadding
              sx={{ py: 0.5, px: 1 }}
              secondaryAction={
                <Switch
                  checked={section.enabled}
                  onChange={() => dispatch({ type: 'TOGGLE_SECTION', sectionId: section.id })}
                  size="small"
                />
              }
            >
              <ListItemText
                primary={section.title}
                secondary={section.enabled ? 'Included in prompt' : 'Excluded'}
                primaryTypographyProps={{ variant: 'body2', fontWeight: section.enabled ? 600 : 400 }}
                secondaryTypographyProps={{ variant: 'caption' }}
                sx={{ opacity: section.enabled ? 1 : 0.5 }}
              />
            </ListItem>
          </Box>
        ))}
      </List>

      <Divider />

      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Custom Sections</Typography>
      <Typography variant="caption" color="text.secondary">
        Custom markdown sections will be added at the end of the prompt.
        Use the Custom Sections toggle above to enable them.
      </Typography>
    </Box>
  );
}
