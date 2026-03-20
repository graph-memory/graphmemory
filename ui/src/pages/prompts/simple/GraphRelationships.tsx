import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import type { GraphName } from '@/content/prompts/index.ts';

interface GraphLink {
  from: GraphName;
  to: GraphName;
  tools: string[];
  description: string;
}

const GRAPH_LINKS: GraphLink[] = [
  { from: 'docs', to: 'code', tools: ['cross_references', 'explain_symbol', 'find_examples'], description: 'Code symbols linked to their documentation sections and examples' },
  { from: 'code', to: 'tasks', tools: ['find_linked_tasks', 'create_task_link'], description: 'Tasks linked to the code files and symbols they affect' },
  { from: 'code', to: 'knowledge', tools: ['find_linked_notes', 'create_relation'], description: 'Knowledge notes linked to code areas they describe' },
  { from: 'tasks', to: 'knowledge', tools: ['create_task_link', 'find_linked_notes'], description: 'Tasks linked to notes providing context and decisions' },
  { from: 'tasks', to: 'skills', tools: ['recall_skills', 'find_linked_skills'], description: 'Skills recalled for tasks, linked to procedures that help' },
  { from: 'knowledge', to: 'skills', tools: ['create_skill_link', 'find_linked_skills'], description: 'Skills linked to knowledge notes with background context' },
  { from: 'files', to: 'code', tools: ['search_all_files', 'get_file_info'], description: 'File Index covers all files; Code Graph adds symbol-level detail for source' },
  { from: 'files', to: 'docs', tools: ['search_all_files'], description: 'File Index covers all files; Docs Graph adds section-level detail for markdown' },
  { from: 'docs', to: 'knowledge', tools: ['create_relation', 'find_linked_notes'], description: 'Notes linked to documentation sections they reference' },
  { from: 'code', to: 'skills', tools: ['create_skill_link', 'find_linked_skills'], description: 'Skills linked to code areas they apply to' },
];

const GRAPH_META: Record<GraphName, { label: string; color: string; abbr: string }> = {
  docs: { label: 'Docs', color: '#ef5350', abbr: 'D' },
  code: { label: 'Code', color: '#42a5f5', abbr: 'C' },
  files: { label: 'Files', color: '#66bb6a', abbr: 'F' },
  knowledge: { label: 'Knowledge', color: '#ffc107', abbr: 'K' },
  tasks: { label: 'Tasks', color: '#7c4dff', abbr: 'T' },
  skills: { label: 'Skills', color: '#ff7043', abbr: 'S' },
};

// Position nodes in a hexagonal layout (fits 240x180 + 40px node size)
const NODE_POSITIONS: Record<GraphName, { x: number; y: number }> = {
  docs:      { x: 55,  y: 10 },
  code:      { x: 155, y: 10 },
  files:     { x: 200, y: 75 },
  knowledge: { x: 155, y: 140 },
  tasks:     { x: 55,  y: 140 },
  skills:    { x: 10,  y: 75 },
};

interface GraphRelationshipsProps {
  enabledGraphs: GraphName[];
}

export default function GraphRelationships({ enabledGraphs }: GraphRelationshipsProps) {
  const enabledSet = useMemo(() => new Set(enabledGraphs), [enabledGraphs]);

  const activeLinks = useMemo(
    () => GRAPH_LINKS.filter(l => enabledSet.has(l.from) && enabledSet.has(l.to)),
    [enabledSet],
  );

  return (
    <Box>
      <Typography variant="overline" sx={{ color: 'text.secondary', mb: 1, display: 'block' }}>
        Cross-Graph Connections
      </Typography>

      <Box sx={{ position: 'relative', width: 240, height: 180, mx: 'auto' }}>
        {/* SVG lines */}
        <svg
          width="240"
          height="180"
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
        >
          {activeLinks.map((link, i) => {
            const from = NODE_POSITIONS[link.from];
            const to = NODE_POSITIONS[link.to];
            const fromColor = GRAPH_META[link.from].color;
            const toColor = GRAPH_META[link.to].color;
            const gradId = `grad-${i}`;
            return (
              <g key={`${link.from}-${link.to}`}>
                <defs>
                  <linearGradient id={gradId} x1={from.x} y1={from.y} x2={to.x} y2={to.y} gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor={fromColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={toColor} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <line
                  x1={from.x + 20}
                  y1={from.y + 20}
                  x2={to.x + 20}
                  y2={to.y + 20}
                  stroke={`url(#${gradId})`}
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
        </svg>

        {/* Graph nodes */}
        {Object.entries(GRAPH_META).map(([name, meta]) => {
          const pos = NODE_POSITIONS[name as GraphName];
          const enabled = enabledSet.has(name as GraphName);
          const nodeLinks = activeLinks.filter(l => l.from === name || l.to === name);
          const tooltipContent = enabled && nodeLinks.length > 0
            ? nodeLinks.map(l => {
                const other = l.from === name ? GRAPH_META[l.to].label : GRAPH_META[l.from].label;
                return `↔ ${other}: ${l.tools.join(', ')}`;
              }).join('\n')
            : `${meta.label} — ${enabled ? 'enabled' : 'not indexed'}`;

          return (
            <Tooltip
              key={name}
              title={
                <Box sx={{ whiteSpace: 'pre-line', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                  {tooltipContent}
                </Box>
              }
              arrow
              placement="top"
            >
              <Box sx={{
                position: 'absolute',
                left: pos.x,
                top: pos.y,
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 2,
                borderColor: enabled ? meta.color : 'divider',
                bgcolor: enabled ? `${meta.color}18` : 'transparent',
                opacity: enabled ? 1 : 0.3,
                transition: 'all 300ms',
                cursor: 'default',
                zIndex: 1,
              }}>
                <Typography variant="caption" sx={{
                  fontWeight: 700,
                  color: enabled ? meta.color : 'text.secondary',
                  fontSize: '0.7rem',
                }}>
                  {meta.abbr}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* Legend */}
      {activeLinks.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5, opacity: 0.6 }}>
          Hover nodes to see cross-graph tools. {activeLinks.length} active connection{activeLinks.length !== 1 ? 's' : ''}.
        </Typography>
      )}
    </Box>
  );
}
