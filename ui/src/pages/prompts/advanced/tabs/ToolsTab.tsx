import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Divider from '@mui/material/Divider';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { TOOL_CATALOG, ALL_TOOL_NAMES, ALL_GRAPHS, GRAPH_LABELS, type GraphName } from '@/content/prompts/index.ts';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import SectionToggle from './SectionToggle.tsx';
import type { ToolPriority } from '../types.ts';

const PRIORITY_COLORS: Record<ToolPriority, string> = {
  always: '#66bb6a',
  prefer: '#42a5f5',
  available: '#9e9e9e',
  avoid: '#ff9800',
  disabled: '#ef5350',
};

const PRIORITY_OPTIONS: { value: ToolPriority; label: string }[] = [
  { value: 'always', label: 'Always' },
  { value: 'prefer', label: 'Prefer' },
  { value: 'available', label: 'Available' },
  { value: 'avoid', label: 'Avoid' },
  { value: 'disabled', label: 'Disabled' },
];

export default function ToolsTab() {
  const { state, dispatch, ensureSectionEnabled } = useBuilderContext();
  const [filter, setFilter] = useState('');

  const toolsByGraph = useMemo(() => {
    const groups = Object.fromEntries(ALL_GRAPHS.map(g => [g, [] as string[]])) as Record<GraphName, string[]>;
    for (const [name, info] of Object.entries(TOOL_CATALOG)) {
      if (filter && !name.includes(filter.toLowerCase())) continue;
      groups[info.graph].push(name);
    }
    return groups;
  }, [filter]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <SectionToggle sectionId="tools" label="Tools" />

      <TextField
        size="small"
        placeholder="Filter tools..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
        fullWidth
      />

      {(Object.entries(toolsByGraph) as [GraphName, string[]][])
        .filter(([, tools]) => tools.length > 0)
        .map(([graph, tools]) => (
          <Accordion key={graph} defaultExpanded={false} disableGutters slotProps={{ transition: { unmountOnExit: true } }} sx={{ '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36, '& .MuiAccordionSummary-content': { my: 0.5 } }}>
              <Typography variant="subtitle2">
                {GRAPH_LABELS[graph]}
                <Chip label={tools.length} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {tools.map(name => {
                const config = state.toolConfigs[name] || { priority: 'available', customInstructions: '' };
                const info = TOOL_CATALOG[name];
                return (
                  <Box key={name} sx={{ mb: 1.5, pb: 1.5, borderBottom: 1, borderColor: 'divider', '&:last-child': { border: 0, mb: 0, pb: 0 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, flex: 1 }}>
                        {name}
                      </Typography>
                      <Select
                        size="small"
                        value={config.priority}
                        onChange={e => { dispatch({
                          type: 'SET_TOOL_CONFIG',
                          tool: name,
                          config: { ...config, priority: e.target.value as ToolPriority },
                        }); ensureSectionEnabled('tools'); }}
                        sx={{
                          height: 28,
                          fontSize: '0.75rem',
                          minWidth: 100,
                          '& .MuiSelect-select': { py: 0.25 },
                          color: PRIORITY_COLORS[config.priority],
                        }}
                      >
                        {PRIORITY_OPTIONS.map(opt => (
                          <MenuItem key={opt.value} value={opt.value} sx={{ fontSize: '0.75rem' }}>
                            {opt.label}
                          </MenuItem>
                        ))}
                      </Select>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                      {info.description}
                    </Typography>
                    <TextField
                      size="small"
                      placeholder="Custom instructions for this tool..."
                      value={config.customInstructions}
                      onChange={e => { dispatch({
                        type: 'SET_TOOL_CONFIG',
                        tool: name,
                        config: { ...config, customInstructions: e.target.value },
                      }); ensureSectionEnabled('tools'); }}
                      fullWidth
                      multiline
                      maxRows={3}
                      sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
                    />
                  </Box>
                );
              })}
            </AccordionDetails>
          </Accordion>
        ))}

      <Divider />

      {/* Tool Chains */}
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Tool Chains</Typography>
      <Typography variant="caption" color="text.secondary">
        Define tool execution sequences. The prompt will instruct the LLM to follow these chains.
      </Typography>

      {state.toolChains.map(chain => (
        <Box key={chain.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <TextField
              size="small"
              placeholder="Chain name"
              value={chain.name}
              onChange={e => {
                const updated = state.toolChains.map(c =>
                  c.id === chain.id ? { ...c, name: e.target.value } : c,
                );
                dispatch({ type: 'SET_TOOL_CHAINS', chains: updated });
              }}
              sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.5 } }}
            />
            <IconButton
              size="small"
              color="error"
              aria-label={`Delete chain ${chain.name || 'unnamed'}`}
              onClick={() => dispatch({
                type: 'SET_TOOL_CHAINS',
                chains: state.toolChains.filter(c => c.id !== chain.id),
              })}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
          <TextField
            size="small"
            placeholder="Description (optional)"
            value={chain.description}
            onChange={e => {
              const updated = state.toolChains.map(c =>
                c.id === chain.id ? { ...c, description: e.target.value } : c,
              );
              dispatch({ type: 'SET_TOOL_CHAINS', chains: updated });
            }}
            fullWidth
            sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.75rem', py: 0.5 } }}
          />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
            {chain.steps.map((tool, i) => (
              <Box key={`${tool}-${i}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                {i > 0 && <Typography variant="caption" color="text.secondary">→</Typography>}
                <Chip
                  label={tool}
                  size="small"
                  onDelete={() => {
                    const updated = state.toolChains.map(c =>
                      c.id === chain.id ? { ...c, steps: c.steps.filter((_, j) => j !== i) } : c,
                    );
                    dispatch({ type: 'SET_TOOL_CHAINS', chains: updated });
                  }}
                  sx={{ height: 20, fontSize: '0.65rem', fontFamily: 'monospace' }}
                />
              </Box>
            ))}
            <Select
              size="small"
              value=""
              displayEmpty
              onChange={e => {
                if (!e.target.value) return;
                const updated = state.toolChains.map(c =>
                  c.id === chain.id ? { ...c, steps: [...c.steps, e.target.value as string] } : c,
                );
                dispatch({ type: 'SET_TOOL_CHAINS', chains: updated });
              }}
              renderValue={() => '+ tool'}
              sx={{ width: 110, height: 24, fontSize: '0.7rem', '& .MuiSelect-select': { py: 0.25 } }}
            >
              {ALL_TOOL_NAMES.map(name => (
                <MenuItem key={name} value={name} sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{name}</MenuItem>
              ))}
            </Select>
          </Box>
        </Box>
      ))}

      <Button
        startIcon={<AddIcon />}
        onClick={() => {
          const id = `chain-${Date.now()}`;
          dispatch({
            type: 'SET_TOOL_CHAINS',
            chains: [...state.toolChains, { id, name: '', steps: [], description: '' }],
          });
        }}
        size="small"
        variant="outlined"
        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
      >
        Add chain
      </Button>

    </Box>
  );
}
