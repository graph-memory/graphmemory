import { useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import DeleteIcon from '@mui/icons-material/Delete';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import AddIcon from '@mui/icons-material/Add';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import type { WorkflowStep } from '../types.ts';

export default function WorkflowTab() {
  const { state, dispatch } = useBuilderContext();
  const workflow = state.workflow;

  const updateWorkflow = useCallback((steps: WorkflowStep[]) => {
    dispatch({ type: 'SET_WORKFLOW', workflow: steps });
  }, [dispatch]);

  const addStep = () => {
    const id = `step-${Date.now()}`;
    updateWorkflow([...workflow, { id, description: '', tools: [], condition: '' }]);
  };

  const removeStep = (id: string) => {
    updateWorkflow(workflow.filter(s => s.id !== id));
  };

  const updateStep = (id: string, patch: Partial<WorkflowStep>) => {
    updateWorkflow(workflow.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= workflow.length) return;
    const next = [...workflow];
    [next[index], next[target]] = [next[target], next[index]];
    updateWorkflow(next);
  };

  const addTool = (stepId: string, tool: string) => {
    const step = workflow.find(s => s.id === stepId);
    if (!step || step.tools.includes(tool)) return;
    updateStep(stepId, { tools: [...step.tools, tool] });
  };

  const removeTool = (stepId: string, tool: string) => {
    const step = workflow.find(s => s.id === stepId);
    if (!step) return;
    updateStep(stepId, { tools: step.tools.filter(t => t !== tool) });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="overline" sx={{ color: 'text.secondary' }}>
          Custom Workflow {workflow.length > 0 ? `(${workflow.length} steps)` : ''}
        </Typography>
      </Box>

      {workflow.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          No custom workflow defined. The scenario's default workflow will be used.
          Add steps below to override it.
        </Typography>
      )}

      {workflow.map((step, i) => (
        <Box key={step.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', width: 24 }}>
              {i + 1}.
            </Typography>
            <Box sx={{ flex: 1 }} />
            <IconButton size="small" onClick={() => moveStep(i, -1)} disabled={i === 0}>
              <ArrowUpwardIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" onClick={() => moveStep(i, 1)} disabled={i === workflow.length - 1}>
              <ArrowDownwardIcon sx={{ fontSize: 16 }} />
            </IconButton>
            <IconButton size="small" onClick={() => removeStep(step.id)} color="error">
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>

          <TextField
            size="small"
            placeholder="Step description..."
            value={step.description}
            onChange={e => updateStep(step.id, { description: e.target.value })}
            fullWidth
            multiline
            maxRows={3}
            sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
          />

          <TextField
            size="small"
            placeholder="Condition (optional, e.g. 'if found')"
            value={step.condition || ''}
            onChange={e => updateStep(step.id, { condition: e.target.value })}
            fullWidth
            sx={{ mb: 1, '& .MuiInputBase-input': { fontSize: '0.75rem' } }}
          />

          {/* Tool badges */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
            {step.tools.map(tool => (
              <Chip
                key={tool}
                label={tool}
                size="small"
                onDelete={() => removeTool(step.id, tool)}
                sx={{ height: 20, fontSize: '0.65rem', fontFamily: 'monospace' }}
              />
            ))}
            <TextField
              size="small"
              placeholder="+ tool"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const input = e.target as HTMLInputElement;
                  if (input.value.trim()) {
                    addTool(step.id, input.value.trim());
                    input.value = '';
                  }
                  e.preventDefault();
                }
              }}
              sx={{ width: 100, '& .MuiInputBase-input': { fontSize: '0.7rem', py: 0.25 } }}
            />
          </Box>
        </Box>
      ))}

      <Button
        startIcon={<AddIcon />}
        onClick={addStep}
        size="small"
        variant="outlined"
        sx={{ textTransform: 'none', alignSelf: 'flex-start' }}
      >
        Add step
      </Button>
    </Box>
  );
}
