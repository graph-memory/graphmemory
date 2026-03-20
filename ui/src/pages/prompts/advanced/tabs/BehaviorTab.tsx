import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import SectionToggle from './SectionToggle.tsx';
import type { Verbosity, CodeExamples, ExplanationDepth, FormatPref } from '../types.ts';

const btnSx = { textTransform: 'none', fontSize: '0.7rem', py: 0.75 } as const;

export default function BehaviorTab() {
  const { state, dispatch, ensureSectionEnabled } = useBuilderContext();
  const b = state.behavior;

  const update = (patch: Partial<typeof b>) => {
    dispatch({ type: 'SET_BEHAVIOR', behavior: { ...b, ...patch } });
    ensureSectionEnabled('behavior');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <SectionToggle sectionId="behavior" label="Response Style" />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Verbosity</Typography>
        <ToggleButtonGroup
          value={b.verbosity}
          exclusive
          onChange={(_, v) => { if (v) update({ verbosity: v as Verbosity }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="concise" sx={btnSx}>Concise</ToggleButton>
          <ToggleButton value="normal" sx={btnSx}>Normal</ToggleButton>
          <ToggleButton value="detailed" sx={btnSx}>Detailed</ToggleButton>
          <ToggleButton value="exhaustive" sx={btnSx}>Exhaust.</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Code Examples</Typography>
        <ToggleButtonGroup
          value={b.codeExamples}
          exclusive
          onChange={(_, v) => { if (v) update({ codeExamples: v as CodeExamples }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="always" sx={btnSx}>Always</ToggleButton>
          <ToggleButton value="when-helpful" sx={btnSx}>When helpful</ToggleButton>
          <ToggleButton value="never" sx={btnSx}>Never</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Explanation Depth</Typography>
        <ToggleButtonGroup
          value={b.explanationDepth}
          exclusive
          onChange={(_, v) => { if (v) update({ explanationDepth: v as ExplanationDepth }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="brief" sx={btnSx}>Brief</ToggleButton>
          <ToggleButton value="standard" sx={btnSx}>Standard</ToggleButton>
          <ToggleButton value="deep-dive" sx={btnSx}>Deep-dive</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Format Preference</Typography>
        <ToggleButtonGroup
          value={b.formatPreference}
          exclusive
          onChange={(_, v) => { if (v) update({ formatPreference: v as FormatPref }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="bullets" sx={btnSx}>Bullets</ToggleButton>
          <ToggleButton value="tables" sx={btnSx}>Tables</ToggleButton>
          <ToggleButton value="prose" sx={btnSx}>Prose</ToggleButton>
          <ToggleButton value="mixed" sx={btnSx}>Mixed</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>Response Language</Typography>
        <TextField
          size="small"
          placeholder="en"
          value={b.responseLanguage}
          onChange={e => update({ responseLanguage: e.target.value })}
          sx={{ width: 120 }}
          helperText="e.g. en, ru, pt, auto"
        />
      </Box>
    </Box>
  );
}
