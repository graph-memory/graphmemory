import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Divider from '@mui/material/Divider';
import { GRAPH_LABELS } from '@/content/prompts/index.ts';
import { useBuilderContext } from '../context/BuilderContext.tsx';

const btnSx = { textTransform: 'none', fontSize: '0.7rem', py: 0.75 } as const;

const TOKEN_OPTIONS = ['1000', '2000', '4000', '8000', '16000'];
const TOKEN_LABELS: Record<string, string> = { '1000': '1k', '2000': '2k', '4000': '4k', '8000': '8k', '16000': '16k' };

export default function ContextBudgetTab() {
  const { state, dispatch } = useBuilderContext();
  const c = state.contextBudget;

  const update = (patch: Partial<typeof c>) => {
    dispatch({ type: 'SET_CONTEXT_BUDGET', budget: { ...c, ...patch } });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Context Budget</Typography>

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Max Code Context</Typography>
        <ToggleButtonGroup
          value={String(c.maxCodeTokens)}
          exclusive
          onChange={(_, v) => { if (v) update({ maxCodeTokens: Number(v) }); }}
          size="small"
          fullWidth
        >
          {TOKEN_OPTIONS.map(n => (
            <ToggleButton key={n} value={n} sx={btnSx}>{TOKEN_LABELS[n]}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Max Doc Context</Typography>
        <ToggleButtonGroup
          value={String(c.maxDocTokens)}
          exclusive
          onChange={(_, v) => { if (v) update({ maxDocTokens: Number(v) }); }}
          size="small"
          fullWidth
        >
          {TOKEN_OPTIONS.map(n => (
            <ToggleButton key={n} value={n} sx={btnSx}>{TOKEN_LABELS[n]}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Max Knowledge Context</Typography>
        <ToggleButtonGroup
          value={String(c.maxKnowledgeTokens)}
          exclusive
          onChange={(_, v) => { if (v) update({ maxKnowledgeTokens: Number(v) }); }}
          size="small"
          fullWidth
        >
          {['500', '1000', '2000', '4000', '8000'].map(n => (
            <ToggleButton key={n} value={n} sx={btnSx}>
              {Number(n) >= 1000 ? `${Number(n) / 1000}k` : n}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>Context Priority Order</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
          Pull context from these graphs first:
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {c.priorityOrder.map((g, i) => (
            <Box key={g} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              {i > 0 && <Typography variant="caption" color="text.secondary">→</Typography>}
              <Typography variant="caption" sx={{
                fontWeight: 600, px: 1, py: 0.25,
                border: 1, borderColor: 'divider', borderRadius: 1,
              }}>
                {GRAPH_LABELS[g]}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Divider />

      <Box>
        <Typography variant="caption" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>Deduplication</Typography>
        <ToggleButtonGroup
          value={c.deduplication}
          exclusive
          onChange={(_, v) => { if (v) update({ deduplication: v as 'strict' | 'fuzzy' | 'none' }); }}
          size="small"
          fullWidth
        >
          <ToggleButton value="strict" sx={btnSx}>Strict</ToggleButton>
          <ToggleButton value="fuzzy" sx={btnSx}>Fuzzy</ToggleButton>
          <ToggleButton value="none" sx={btnSx}>None</ToggleButton>
        </ToggleButtonGroup>
      </Box>
    </Box>
  );
}
