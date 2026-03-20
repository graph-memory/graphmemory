import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useTheme } from '@mui/material/styles';

interface FlowStep {
  status: string;
  label: string;
  color: string;
  tools: Array<{ name: string; hint: string }>;
}

const FLOW_STEPS: FlowStep[] = [
  {
    status: 'backlog',
    label: 'Backlog',
    color: '#9e9e9e',
    tools: [
      { name: 'create_task', hint: 'Create new tasks with priority and description' },
      { name: 'search_tasks', hint: 'Find related or duplicate tasks' },
    ],
  },
  {
    status: 'todo',
    label: 'Todo',
    color: '#42a5f5',
    tools: [
      { name: 'recall_skills', hint: 'Find procedures before starting work' },
      { name: 'find_linked_tasks', hint: 'Check blockers and dependencies' },
    ],
  },
  {
    status: 'in_progress',
    label: 'In Progress',
    color: '#ffa726',
    tools: [
      { name: 'search_code', hint: 'Find relevant code to modify' },
      { name: 'get_symbol', hint: 'Read full implementations' },
      { name: 'create_note', hint: 'Capture decisions and discoveries' },
      { name: 'link_task', hint: 'Connect to related tasks' },
    ],
  },
  {
    status: 'review',
    label: 'Review',
    color: '#ab47bc',
    tools: [
      { name: 'cross_references', hint: 'Verify docs match code changes' },
      { name: 'find_linked_tasks', hint: 'Check all related work is done' },
      { name: 'find_examples', hint: 'Verify doc examples are accurate' },
    ],
  },
  {
    status: 'done',
    label: 'Done',
    color: '#66bb6a',
    tools: [
      { name: 'move_task', hint: 'Mark as completed (auto-sets completedAt)' },
      { name: 'bump_skill_usage', hint: 'Track which skills were applied' },
      { name: 'create_skill', hint: 'Save new reusable procedures' },
    ],
  },
];

export default function TaskFlowDiagram() {
  const theme = useTheme();

  return (
    <Box>
      <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
        Task Lifecycle
      </Typography>

      {/* Flow steps */}
      <Box sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        overflowX: 'auto',
        pb: 1,
      }}>
        {FLOW_STEPS.map((step, i) => (
          <Box key={step.status} sx={{ display: 'flex', alignItems: 'flex-start' }}>
            {/* Step card */}
            <Box sx={{
              minWidth: 140,
              flex: '0 0 auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.75,
            }}>
              {/* Status badge */}
              <Box sx={{
                px: 1.5,
                py: 0.5,
                borderRadius: 2,
                bgcolor: `${step.color}18`,
                border: 1,
                borderColor: `${step.color}40`,
                width: '100%',
                textAlign: 'center',
              }}>
                <Typography variant="caption" sx={{
                  fontWeight: 700,
                  color: step.color,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontSize: '0.65rem',
                }}>
                  {step.label}
                </Typography>
              </Box>

              {/* Tool chips */}
              <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
                width: '100%',
                alignItems: 'center',
              }}>
                {step.tools.map(tool => (
                  <Tooltip key={tool.name} title={tool.hint} arrow placement="bottom">
                    <Chip
                      label={tool.name}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 18,
                        fontSize: '0.6rem',
                        fontFamily: 'monospace',
                        borderColor: theme.palette.divider,
                        color: 'text.secondary',
                        maxWidth: '100%',
                        '&:hover': {
                          borderColor: step.color,
                          color: step.color,
                        },
                      }}
                    />
                  </Tooltip>
                ))}
              </Box>
            </Box>

            {/* Arrow */}
            {i < FLOW_STEPS.length - 1 && (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                px: 0.5,
                pt: 1,
                color: 'text.secondary',
                opacity: 0.3,
              }}>
                <ArrowForwardIcon sx={{ fontSize: 16 }} />
              </Box>
            )}
          </Box>
        ))}
      </Box>

      {/* Cancelled note */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', opacity: 0.6 }}>
        Tasks can be moved to <b>cancelled</b> from any status via <code style={{ fontSize: '0.65rem' }}>move_task</code>
      </Typography>
    </Box>
  );
}
