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
import type { GraphName } from '@/content/prompts/index.ts';
import type { GraphStats } from '../prompt-builder.ts';

interface GraphCardData {
  name: GraphName;
  label: string;
  icon: React.ReactElement;
  color: string;
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
    color: '#ef5350',
    shortDesc: 'Markdown sections & code blocks',
    indexed: 'Every .md file parsed into heading sections with code blocks and cross-file links',
    useCase: 'Find documentation by meaning, verify code examples, explain symbols with context',
    keyTools: ['search', 'get_toc', 'cross_references', 'explain_symbol'],
  },
  {
    name: 'code',
    label: 'Code',
    icon: <CodeIcon sx={{ fontSize: 18 }} />,
    color: '#42a5f5',
    shortDesc: 'Functions, classes, interfaces',
    indexed: 'Every .ts/.js/.tsx/.jsx file parsed with tree-sitter into symbol-level nodes',
    useCase: 'Find code by meaning, read full implementations, see code-to-docs connections',
    keyTools: ['search_code', 'get_symbol', 'get_file_symbols', 'cross_references'],
  },
  {
    name: 'files',
    label: 'Files',
    icon: <FolderOutlinedIcon sx={{ fontSize: 18 }} />,
    color: '#66bb6a',
    shortDesc: 'Full project file tree',
    indexed: 'Every file and directory — paths, sizes, MIME types, modification times',
    useCase: 'Understand project structure, find configs, discover non-code files',
    keyTools: ['search_all_files', 'list_all_files', 'get_file_info'],
  },
  {
    name: 'knowledge',
    label: 'Knowledge',
    icon: <LightbulbOutlinedIcon sx={{ fontSize: 18 }} />,
    color: '#ffc107',
    shortDesc: 'Notes, facts & decisions',
    indexed: 'User-created notes with titles, content, tags, and cross-graph links. Mirrored to .notes/',
    useCase: 'Capture decisions, record gotchas, build searchable knowledge base',
    keyTools: ['create_note', 'search_notes', 'create_relation', 'find_linked_notes'],
  },
  {
    name: 'tasks',
    label: 'Tasks',
    icon: <AssignmentOutlinedIcon sx={{ fontSize: 18 }} />,
    color: '#7c4dff',
    shortDesc: 'Kanban with cross-graph links',
    indexed: 'Tasks with status (backlog→done), priority, assignee, due dates. Mirrored to .tasks/',
    useCase: 'Track work, manage priorities, link tasks to code and docs',
    keyTools: ['create_task', 'list_tasks', 'move_task', 'find_linked_tasks'],
  },
  {
    name: 'skills',
    label: 'Skills',
    icon: <PsychologyOutlinedIcon sx={{ fontSize: 18 }} />,
    color: '#ff7043',
    shortDesc: 'Reusable procedures & recipes',
    indexed: 'Skills with steps, triggers, usage tracking. Mirrored to .skills/',
    useCase: 'Recall procedures before starting work, save reusable workflows',
    keyTools: ['recall_skills', 'create_skill', 'search_skills', 'bump_skill_usage'],
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
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' },
        gap: 1.5,
      }}>
        {CARD_DATA.map(card => {
          const stat = graphStats.find(s => s.name === card.name);
          const available = stat?.available ?? false;
          const count = stat?.nodeCount ?? 0;
          const enabled = graphs[card.name] && available;

          return (
            <Box
              key={card.name}
              onClick={e => setPopover({ card, anchor: e.currentTarget as HTMLElement })}
              sx={{
                border: 1,
                borderColor: enabled ? `${card.color}60` : 'divider',
                borderRadius: 2,
                p: 1.5,
                cursor: 'pointer',
                bgcolor: enabled ? `${card.color}08` : 'transparent',
                opacity: available ? 1 : 0.4,
                transition: 'all 200ms',
                '&:hover': available ? { borderColor: `${card.color}90`, bgcolor: `${card.color}12` } : {},
              }}
            >
              {/* Header row */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box sx={{ color: enabled ? card.color : 'text.secondary', display: 'flex' }}>
                  {card.icon}
                </Box>
                <Typography variant="subtitle2" sx={{ flex: 1, fontWeight: 600 }}>
                  {card.label}
                </Typography>
                <Chip
                  label={available ? count : 'n/a'}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.7rem',
                    bgcolor: enabled ? `${card.color}20` : undefined,
                    color: enabled ? card.color : 'text.secondary',
                  }}
                />
                <Switch
                  checked={enabled}
                  disabled={!available}
                  onChange={e => { e.stopPropagation(); onToggle(card.name); }}
                  onClick={e => e.stopPropagation()}
                  size="small"
                  sx={{
                    '& .MuiSwitch-switchBase.Mui-checked': { color: card.color },
                    '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: card.color },
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
              <Box sx={{ color: popover.card.color, display: 'flex' }}>{popover.card.icon}</Box>
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
                      borderColor: `${popover.card.color}40`,
                      color: popover.card.color,
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
