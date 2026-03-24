import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import Popover from '@mui/material/Popover';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CodeIcon from '@mui/icons-material/Code';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import { GRAPH_COLORS, type GraphName } from '@/content/prompts/index.ts';
import type { GraphStats } from '../prompt-builder.ts';

interface GraphCardData {
  name: GraphName;
  label: string;
  icon: React.ReactElement;
  shortDesc: string;
  indexed: string;
  useCase: string;
  keyTools: string[];
}

const CARD_DATA: GraphCardData[] = [
  {
    name: 'docs',
    label: 'Docs',
    icon: <DescriptionOutlinedIcon sx={{ fontSize: 18 }} />,
    shortDesc: 'Markdown sections & code blocks',
    indexed: 'Every .md file parsed into heading sections with code blocks and cross-file links',
    useCase: 'Find documentation by meaning, verify code examples, explain symbols with context',
    keyTools: ['docs_search', 'docs_get_toc', 'docs_cross_references', 'docs_explain_symbol'],
  },
  {
    name: 'code',
    label: 'Code',
    icon: <CodeIcon sx={{ fontSize: 18 }} />,
    shortDesc: 'Functions, classes, interfaces',
    indexed: 'Every .ts/.js/.tsx/.jsx file parsed with tree-sitter into symbol-level nodes',
    useCase: 'Find code by meaning, read full implementations, see code-to-docs connections',
    keyTools: ['code_search', 'code_get_symbol', 'code_get_file_symbols', 'docs_cross_references'],
  },
  {
    name: 'files',
    label: 'Files',
    icon: <FolderOutlinedIcon sx={{ fontSize: 18 }} />,
    shortDesc: 'Full project file tree',
    indexed: 'Every file and directory — paths, sizes, MIME types, modification times',
    useCase: 'Understand project structure, find configs, discover non-code files',
    keyTools: ['files_search', 'files_list', 'files_get_info'],
  },
  {
    name: 'knowledge',
    label: 'Knowledge',
    icon: <LightbulbOutlinedIcon sx={{ fontSize: 18 }} />,
    shortDesc: 'Notes, facts & decisions',
    indexed: 'User-created notes with titles, content, tags, and cross-graph links. Mirrored to .notes/',
    useCase: 'Capture decisions, record gotchas, build searchable knowledge base',
    keyTools: ['notes_create', 'notes_search', 'notes_create_link', 'notes_find_linked'],
  },
  {
    name: 'tasks',
    label: 'Tasks',
    icon: <AssignmentOutlinedIcon sx={{ fontSize: 18 }} />,
    shortDesc: 'Kanban with cross-graph links',
    indexed: 'Tasks with status (backlog→done), priority, assignee, due dates. Mirrored to .tasks/',
    useCase: 'Track work, manage priorities, link tasks to code and docs',
    keyTools: ['tasks_create', 'tasks_list', 'tasks_move', 'tasks_find_linked'],
  },
  {
    name: 'skills',
    label: 'Skills',
    icon: <PsychologyOutlinedIcon sx={{ fontSize: 18 }} />,
    shortDesc: 'Reusable procedures & recipes',
    indexed: 'Skills with steps, triggers, usage tracking. Mirrored to .skills/',
    useCase: 'Recall procedures before starting work, save reusable workflows',
    keyTools: ['skills_recall', 'skills_create', 'skills_search', 'skills_bump_usage'],
  },
];

interface GraphCardsProps {
  graphs: Record<GraphName, boolean>;
  graphStats: GraphStats[];
  onToggle: (name: GraphName) => void;
}

export default function GraphCards({ graphs, graphStats, onToggle }: GraphCardsProps) {
  const [popover, setPopover] = useState<{ card: GraphCardData; anchor: HTMLElement } | null>(null);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Cards grid */}
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}>
        {CARD_DATA.map(card => {
          const stat = graphStats.find(s => s.name === card.name);
          const count = stat?.nodeCount ?? 0;
          const enabled = !!graphs[card.name];

          return (
            <Box
              key={card.name}
              role="button"
              tabIndex={0}
              aria-label={`${card.label} graph — ${enabled ? 'enabled' : 'disabled'}`}
              onClick={e => setPopover({ card, anchor: e.currentTarget as HTMLElement })}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPopover({ card, anchor: e.currentTarget as HTMLElement }); } }}
              sx={{
                border: 1,
                borderColor: enabled ? `${GRAPH_COLORS[card.name]}60` : 'divider',
                borderRadius: 2,
                p: 1.5,
                cursor: 'pointer',
                bgcolor: enabled ? `${GRAPH_COLORS[card.name]}08` : 'transparent',
                transition: 'all 200ms',
                '&:hover': { borderColor: `${GRAPH_COLORS[card.name]}90`, bgcolor: `${GRAPH_COLORS[card.name]}12` },
              }}
            >
              {/* Header row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ color: enabled ? GRAPH_COLORS[card.name] : 'text.secondary', display: 'flex' }}>
                  {card.icon}
                </Box>
                <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
                  {card.label}
                </Typography>
                <Chip
                  label={count}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.7rem',
                    bgcolor: enabled ? `${GRAPH_COLORS[card.name]}20` : undefined,
                    color: enabled ? GRAPH_COLORS[card.name] : 'text.secondary',
                  }}
                />
                <Switch
                  checked={enabled}
                  onChange={e => { e.stopPropagation(); onToggle(card.name); }}
                  onClick={e => e.stopPropagation()}
                  size="small"
                  inputProps={{ 'aria-label': `Toggle ${card.label} graph` }}
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: GRAPH_COLORS[card.name] },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: GRAPH_COLORS[card.name] },
                  }}
                />
              </Box>
              {/* Short description */}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, lineHeight: 1.4 }}>
                {card.shortDesc}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Detail popover */}
      <Popover
        open={!!popover}
        anchorEl={popover?.anchor}
        onClose={() => setPopover(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 320, mt: 0.5 } } }}
      >
        {popover && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ color: GRAPH_COLORS[popover.card.name], display: 'flex' }}>{popover.card.icon}</Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{popover.card.label}</Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>What gets indexed:</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                {popover.card.indexed}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Use case:</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                {popover.card.useCase}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>Key tools:</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.25 }}>
                {popover.card.keyTools.map(tool => (
                  <Chip
                    key={tool}
                    label={tool}
                    size="small"
                    variant="outlined"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontFamily: 'monospace',
                      borderColor: `${GRAPH_COLORS[popover.card.name]}40`,
                      color: GRAPH_COLORS[popover.card.name],
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Popover>
    </Box>
  );
}
