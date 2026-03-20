import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { STYLE_OPTIONS } from '@/content/prompts/index.ts';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import SectionToggle from './SectionToggle.tsx';

export default function StyleTab() {
  const { state, dispatch, ensureSectionEnabled } = useBuilderContext();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionToggle sectionId="style" label="Style" />
      <List dense disablePadding>
        {STYLE_OPTIONS.map(opt => (
          <ListItemButton
            key={opt.value}
            selected={state.style === opt.value}
            onClick={() => { dispatch({ type: 'SET_STYLE', style: opt.value }); ensureSectionEnabled('style'); }}
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
