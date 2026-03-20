import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Divider from '@mui/material/Divider';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import SectionToggle from './SectionToggle.tsx';
import type { CollabMode, ReviewStrictness } from '../types.ts';

const btnSx = { textTransform: 'none', fontSize: '0.7rem', py: 0.75 } as const;

export default function CollaborationTab() {
  const { state, dispatch, ensureSectionEnabled } = useBuilderContext();
  const c = state.collaboration;

  const update = (patch: Partial<typeof c>) => {
    dispatch({ type: 'SET_COLLABORATION', collaboration: { ...c, ...patch } });
    ensureSectionEnabled('collaboration');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <SectionToggle sectionId="collaboration" label="Collaboration" />

      {/* Mode */}
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Work Mode</Typography>
        <ToggleButtonGroup
          value={c.mode}
          exclusive
          onChange={(_, v) => { if (v) update({ mode: v as CollabMode }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="solo" sx={btnSx}>Solo</ToggleButton>
          <ToggleButton value="pair" sx={btnSx}>Pair</ToggleButton>
          <ToggleButton value="team-lead" sx={btnSx}>Team Lead</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      {/* Review Strictness */}
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Review Strictness</Typography>
        <ToggleButtonGroup
          value={c.reviewStrictness}
          exclusive
          onChange={(_, v) => { if (v) update({ reviewStrictness: v as ReviewStrictness }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="lenient" sx={btnSx}>Lenient</ToggleButton>
          <ToggleButton value="standard" sx={btnSx}>Standard</ToggleButton>
          <ToggleButton value="strict" sx={btnSx}>Strict</ToggleButton>
          <ToggleButton value="pedantic" sx={btnSx}>Pedantic</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      {/* Commit Style */}
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Commit Message Style</Typography>
        <ToggleButtonGroup
          value={c.commitStyle}
          exclusive
          onChange={(_, v) => { if (v) update({ commitStyle: v as 'conventional' | 'descriptive' | 'minimal' }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="conventional" sx={btnSx}>Conventional</ToggleButton>
          <ToggleButton value="descriptive" sx={btnSx}>Descriptive</ToggleButton>
          <ToggleButton value="minimal" sx={btnSx}>Minimal</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      {/* PR Format */}
      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>PR Description Format</Typography>
        <ToggleButtonGroup
          value={c.prFormat}
          exclusive
          onChange={(_, v) => { if (v) update({ prFormat: v as 'detailed' | 'standard' | 'minimal' }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="detailed" sx={btnSx}>Detailed</ToggleButton>
          <ToggleButton value="standard" sx={btnSx}>Standard</ToggleButton>
          <ToggleButton value="minimal" sx={btnSx}>Minimal</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
}
