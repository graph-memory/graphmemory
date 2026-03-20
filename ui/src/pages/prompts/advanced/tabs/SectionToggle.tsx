import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import { useBuilderContext } from '../context/BuilderContext.tsx';

interface SectionToggleProps {
  sectionId: string;
  label: string;
}

export default function SectionToggle({ sectionId, label }: SectionToggleProps) {
  const { state, dispatch } = useBuilderContext();
  const section = state.promptSections.find(s => s.id === sectionId);
  if (!section) return null;

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      px: 1.5, py: 0.75, mb: 1,
      border: 1, borderColor: section.enabled ? 'primary.main' : 'divider',
      borderRadius: 1, bgcolor: section.enabled ? 'action.selected' : 'transparent',
    }}>
      <Typography variant="caption" sx={{ fontWeight: 600, color: section.enabled ? 'primary.main' : 'text.secondary' }}>
        {section.enabled ? `${label} — included in prompt` : `${label} — excluded from prompt`}
      </Typography>
      <Switch
        checked={section.enabled}
        onChange={() => dispatch({ type: 'TOGGLE_SECTION', sectionId })}
        size="small"
        inputProps={{ 'aria-label': `${section.enabled ? 'Exclude' : 'Include'} ${label} section` }}
      />
    </Box>
  );
}
