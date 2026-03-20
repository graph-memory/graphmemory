import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Chip from '@mui/material/Chip';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { TOOL_CATALOG, GRAPH_LABELS, type GraphName } from '@/content/prompts/index.ts';
import { useBuilderContext } from '../context/BuilderContext.tsx';
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
  const { state, dispatch } = useBuilderContext();
  const [filter, setFilter] = useState('');

  const toolsByGraph = useMemo(() => {
    const groups: Record<GraphName, string[]> = { docs: [], code: [], files: [], knowledge: [], tasks: [], skills: [] };
    for (const [name, info] of Object.entries(TOOL_CATALOG)) {
      if (filter && !name.includes(filter.toLowerCase())) continue;
      groups[info.graph].push(name);
    }
    return groups;
  }, [filter]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>Tool Configuration</Typography>

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
          <Accordion key={graph} defaultExpanded={false} disableGutters sx={{ '&:before': { display: 'none' } }}>
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
                        onChange={e => dispatch({
                          type: 'SET_TOOL_CONFIG',
                          tool: name,
                          config: { ...config, priority: e.target.value as ToolPriority },
                        })}
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
                      onChange={e => dispatch({
                        type: 'SET_TOOL_CONFIG',
                        tool: name,
                        config: { ...config, customInstructions: e.target.value },
                      })}
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
    </Box>
  );
}
