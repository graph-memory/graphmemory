import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Divider from '@mui/material/Divider';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import type { SearchDepth } from '../types.ts';

const btnSx = { textTransform: 'none', fontSize: '0.7rem', py: 0.75 } as const;

export default function SearchStrategyTab() {
  const { state, dispatch } = useBuilderContext();
  const s = state.searchStrategy;

  const update = (patch: Partial<typeof s>) => {
    dispatch({ type: 'SET_SEARCH_STRATEGY', strategy: { ...s, ...patch } });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Search Strategy</Typography>

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Default Search Depth</Typography>
        <ToggleButtonGroup
          value={s.defaultDepth}
          exclusive
          onChange={(_, v) => { if (v) update({ defaultDepth: v as SearchDepth }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="shallow" sx={btnSx}>Shallow</ToggleButton>
          <ToggleButton value="medium" sx={btnSx}>Medium</ToggleButton>
          <ToggleButton value="deep" sx={btnSx}>Deep</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Cross-Graph Expansion</Typography>
        <ToggleButtonGroup
          value={s.crossGraphExpansion}
          exclusive
          onChange={(_, v) => { if (v) update({ crossGraphExpansion: v as 'always' | 'when-needed' | 'never' }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="always" sx={btnSx}>Always</ToggleButton>
          <ToggleButton value="when-needed" sx={btnSx}>When needed</ToggleButton>
          <ToggleButton value="never" sx={btnSx}>Never</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>BFS Hops</Typography>
        <ToggleButtonGroup
          value={String(s.bfsHops)}
          exclusive
          onChange={(_, v) => { if (v) update({ bfsHops: Number(v) }); }}
          size="small"
          fullWidth
        >
          {[1, 2, 3, 4, 5].map(n => (
            <ToggleButton key={n} value={String(n)} sx={btnSx}>{n}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Results per Query</Typography>
        <ToggleButtonGroup
          value={String(s.resultCount)}
          exclusive
          onChange={(_, v) => { if (v) update({ resultCount: Number(v) }); }}
          size="small"
          fullWidth
        >
          {[5, 10, 20, 30, 50].map(n => (
            <ToggleButton key={n} value={String(n)} sx={btnSx}>{n}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
          Search Balance: {s.keywordWeight < 30 ? 'Semantic' : s.keywordWeight > 70 ? 'Keyword' : 'Balanced'}
        </Typography>
        <ToggleButtonGroup
          value={String(s.keywordWeight)}
          exclusive
          onChange={(_, v) => { if (v) update({ keywordWeight: Number(v) }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="0" sx={btnSx}>Semantic</ToggleButton>
          <ToggleButton value="25" sx={btnSx}>Sem+</ToggleButton>
          <ToggleButton value="50" sx={btnSx}>Balanced</ToggleButton>
          <ToggleButton value="75" sx={btnSx}>Key+</ToggleButton>
          <ToggleButton value="100" sx={btnSx}>Keyword</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
}
