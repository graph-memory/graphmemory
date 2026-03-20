import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Divider from '@mui/material/Divider';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import type { AutoCreate } from '../types.ts';

const btnSx = { textTransform: 'none', fontSize: '0.7rem', py: 0.75 } as const;

export default function MemoryStrategyTab() {
  const { state, dispatch } = useBuilderContext();
  const m = state.memoryStrategy;

  const update = (patch: Partial<typeof m>) => {
    dispatch({ type: 'SET_MEMORY_STRATEGY', strategy: { ...m, ...patch } });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Knowledge Management</Typography>

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Auto-create Notes</Typography>
        <ToggleButtonGroup
          value={m.autoCreateNotes}
          exclusive
          onChange={(_, v) => { if (v) update({ autoCreateNotes: v as AutoCreate }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="always" sx={btnSx}>Always</ToggleButton>
          <ToggleButton value="ask" sx={btnSx}>Ask first</ToggleButton>
          <ToggleButton value="never" sx={btnSx}>Never</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Note Detail Level</Typography>
        <ToggleButtonGroup
          value={String(m.noteDetailLevel)}
          exclusive
          onChange={(_, v) => { if (v) update({ noteDetailLevel: Number(v) }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="1" sx={btnSx}>Minimal</ToggleButton>
          <ToggleButton value="2" sx={btnSx}>Brief</ToggleButton>
          <ToggleButton value="3" sx={btnSx}>Moderate</ToggleButton>
          <ToggleButton value="4" sx={btnSx}>Detailed</ToggleButton>
          <ToggleButton value="5" sx={btnSx}>Full</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Relation Strategy</Typography>
        <ToggleButtonGroup
          value={m.relationStrategy}
          exclusive
          onChange={(_, v) => { if (v) update({ relationStrategy: v as 'aggressive' | 'conservative' | 'manual' }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="aggressive" sx={btnSx}>Aggressive</ToggleButton>
          <ToggleButton value="conservative" sx={btnSx}>Conservative</ToggleButton>
          <ToggleButton value="manual" sx={btnSx}>Manual</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Skill Capture</Typography>
        <ToggleButtonGroup
          value={String(m.skillCaptureThreshold)}
          exclusive
          onChange={(_, v) => { if (v) update({ skillCaptureThreshold: Number(v) }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="1" sx={btnSx}>All</ToggleButton>
          <ToggleButton value="2" sx={btnSx}>Often</ToggleButton>
          <ToggleButton value="3" sx={btnSx}>Moderate</ToggleButton>
          <ToggleButton value="4" sx={btnSx}>Rare</ToggleButton>
          <ToggleButton value="5" sx={btnSx}>Complex</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Auto-create Tasks</Typography>
        <ToggleButtonGroup
          value={m.taskAutoCreate}
          exclusive
          onChange={(_, v) => { if (v) update({ taskAutoCreate: v as AutoCreate }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="always" sx={btnSx}>Always</ToggleButton>
          <ToggleButton value="ask" sx={btnSx}>Ask first</ToggleButton>
          <ToggleButton value="never" sx={btnSx}>Never</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
}
