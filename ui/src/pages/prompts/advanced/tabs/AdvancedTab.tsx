import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Divider from '@mui/material/Divider';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import type { CustomSection } from '../types.ts';

export default function AdvancedTab() {
  const { state, dispatch } = useBuilderContext();

  const sections = [...state.promptSections].sort((a, b) => a.weight - b.weight);

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    // Swap weights
    const updated = state.promptSections.map(s => {
      if (s.id === sections[index].id) return { ...s, weight: sections[target].weight };
      if (s.id === sections[target].id) return { ...s, weight: sections[index].weight };
      return s;
    });
    dispatch({ type: 'SET_PROMPT_SECTIONS', sections: updated });
  };

  // Custom sections
  const customs = state.customSections;

  const addCustomSection = () => {
    const id = `custom-${Date.now()}`;
    dispatch({ type: 'SET_CUSTOM_SECTIONS', sections: [...customs, { id, title: '', markdown: '' }] });
    // Auto-enable the custom sections toggle
    const customToggle = state.promptSections.find(s => s.id === 'custom');
    if (customToggle && !customToggle.enabled) {
      dispatch({ type: 'TOGGLE_SECTION', sectionId: 'custom' });
    }
  };

  const updateCustomSection = (id: string, patch: Partial<CustomSection>) => {
    dispatch({
      type: 'SET_CUSTOM_SECTIONS',
      sections: customs.map(s => s.id === id ? { ...s, ...patch } : s),
    });
  };

  const removeCustomSection = (id: string) => {
    dispatch({ type: 'SET_CUSTOM_SECTIONS', sections: customs.filter(s => s.id !== id) });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Prompt Sections</Typography>

      <Typography variant="caption" color="text.secondary">
        Toggle sections on/off and reorder with arrows. Sections are assembled top to bottom.
      </Typography>

      <List dense disablePadding>
        {sections.map((section, i) => (
          <Box key={section.id}>
            {i > 0 && <Divider />}
            <ListItem
              disablePadding
              sx={{ py: 0.5, px: 1 }}
              secondaryAction={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <IconButton size="small" onClick={() => moveSection(i, -1)} disabled={i === 0}>
                    <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                  <IconButton size="small" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1}>
                    <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                  <Switch
                    checked={section.enabled}
                    onChange={() => dispatch({ type: 'TOGGLE_SECTION', sectionId: section.id })}
                    size="small"
                  />
                </Box>
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

      {customs.map(section => (
        <Box key={section.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              placeholder="Section title"
              value={section.title}
              onChange={e => updateCustomSection(section.id, { title: e.target.value })}
              sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 } }}
            />
            <IconButton size="small" onClick={() => removeCustomSection(section.id)} color="error">
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <TextField
            size="small"
            placeholder="Markdown content..."
            value={section.markdown}
            onChange={e => updateCustomSection(section.id, { markdown: e.target.value })}
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem' } }}
          />
        </Box>
      ))}

      <Button
        startIcon={<AddIcon />}
        onClick={addCustomSection}
        size="small"
        variant="outlined"
        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
      >
        Add custom section
      </Button>
    </Box>
  );
}
