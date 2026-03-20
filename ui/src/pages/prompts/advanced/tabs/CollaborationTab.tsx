import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Divider from '@mui/material/Divider';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import type { CollabMode, ReviewStrictness } from '../types.ts';

export default function CollaborationTab() {
  const { state, dispatch } = useBuilderContext();
  const c = state.collaboration;

  const update = (patch: Partial<typeof c>) => {
    dispatch({ type: 'SET_COLLABORATION', collaboration: { ...c, ...patch } });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Collaboration</Typography>

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
          <ToggleButton value="solo" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Solo</ToggleButton>
          <ToggleButton value="pair" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Pair</ToggleButton>
          <ToggleButton value="team-lead" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Team Lead</ToggleButton>
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
          <ToggleButton value="lenient" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Lenient</ToggleButton>
          <ToggleButton value="standard" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Standard</ToggleButton>
          <ToggleButton value="strict" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Strict</ToggleButton>
          <ToggleButton value="pedantic" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Pedantic</ToggleButton>
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
          <ToggleButton value="conventional" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Conventional</ToggleButton>
          <ToggleButton value="descriptive" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Descriptive</ToggleButton>
          <ToggleButton value="minimal" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Minimal</ToggleButton>
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
          <ToggleButton value="detailed" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Detailed</ToggleButton>
          <ToggleButton value="standard" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Standard</ToggleButton>
          <ToggleButton value="minimal" sx={{ textTransform: 'none', fontSize: '0.7rem', py: 0.75 }}>Minimal</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
}
