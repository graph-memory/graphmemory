import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, ToggleButtonGroup, ToggleButton, Paper, Chip,
  CircularProgress, Alert, IconButton, Tooltip, TextField, InputAdornment,
  useTheme,
} from '@mui/material';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import CodeIcon from '@mui/icons-material/Code';
import PsychologyIcon from '@mui/icons-material/Psychology';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import SearchIcon from '@mui/icons-material/Search';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { exportGraph, type GraphScope, type GraphNode, type GraphEdge } from '@/entities/graph/index.ts';
import { PageTopBar, Section, FieldRow, CopyButton, StatusBadge } from '@/shared/ui/index.ts';

cytoscape.use(fcose);

const GRAPH_COLORS: Record<string, string> = {
  knowledge: '#f9a825',
  tasks:     '#1976d2',
  skills:    '#9c27b0',
  files:     '#388e3c',
  docs:      '#7b1fa2',
  code:      '#f57c00',
};

const GRAPH_BADGE_COLOR: Record<string, 'warning' | 'primary' | 'success' | 'neutral' | 'error'> = {
  knowledge: 'warning',
  tasks: 'primary',
  skills: 'neutral',
  files: 'success',
  docs: 'neutral',
  code: 'error',
};

const SCOPE_CONFIG: { scope: GraphScope; label: string; icon: React.ReactNode }[] = [
  { scope: 'all',       label: 'All',       icon: null },
  { scope: 'knowledge', label: 'Knowledge', icon: <LightbulbIcon sx={{ fontSize: 16 }} /> },
  { scope: 'tasks',     label: 'Tasks',     icon: <ViewKanbanIcon sx={{ fontSize: 16 }} /> },
  { scope: 'skills',    label: 'Skills',    icon: <PsychologyIcon sx={{ fontSize: 16 }} /> },
  { scope: 'files',     label: 'Files',     icon: <FolderIcon sx={{ fontSize: 16 }} /> },
  { scope: 'docs',      label: 'Docs',      icon: <DescriptionIcon sx={{ fontSize: 16 }} /> },
  { scope: 'code',      label: 'Code',      icon: <CodeIcon sx={{ fontSize: 16 }} /> },
];

interface NodeData {
  id: string;
  label: string;
  color: string;
  graphType: string;
  graph: string;
  title?: string;
  name?: string;
  path?: string;
  [k: string]: unknown;
}

function getNodeLabel(node: Pick<GraphNode, 'id' | 'title' | 'name' | 'path'>): string {
  return node.title || node.name || node.path || node.id;
}

function getNodeColor(node: Pick<GraphNode, 'graph'>): string {
  return GRAPH_COLORS[node.graph] || '#569cd6';
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

export default function GraphPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { palette } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  const focusParam = searchParams.get('focus');
  const scopeParam = searchParams.get('scope') as GraphScope | null;
  const [scope, setScope] = useState<GraphScope>(scopeParam || 'all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{ nodes: number; edges: number }>({ nodes: 0, edges: 0 });
  const [selected, setSelected] = useState<NodeData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isDark = palette.mode === 'dark';
  const textColor = isDark ? '#e0e0e0' : '#333';
  const borderColor = isDark ? '#444' : '#ccc';
  const lineColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
  const dimLineColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
  const accentColor = palette.primary.main;
  const bgColor = isDark ? '#1e1e1e' : '#f5f5f5';

  const highlightNode = useCallback((cy: cytoscape.Core, nodeId: string) => {
    const node = cy.getElementById(nodeId);
    if (node.length === 0) return;
    const neighborhood = node.neighborhood().add(node);
    cy.elements().not(neighborhood).addClass('dimmed');
    neighborhood.addClass('highlighted');
    node.addClass('selected-node');
  }, []);

  const clearHighlight = useCallback((cy: cytoscape.Core) => {
    cy.elements().removeClass('dimmed highlighted selected-node');
  }, []);

  const renderGraph = (nodes: GraphNode[], edges: GraphEdge[]) => {
    if (!containerRef.current) return;

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const elements: cytoscape.ElementDefinition[] = [];

    // Compute degree map for node sizing
    const degreeMap = new Map<string, number>();
    for (const edge of edges) {
      degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
      degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
    }
    const maxDegree = Math.max(1, ...degreeMap.values());

    for (const node of nodes) {
      const { id: _id, ...rest } = node;
      const degree = degreeMap.get(node.id) || 0;
      const size = 12 + Math.round((degree / maxDegree) * 28);
      elements.push({
        data: {
          id: node.id,
          label: truncate(getNodeLabel(node), 25),
          color: getNodeColor(node),
          graphType: node.graph,
          nodeSize: size,
          ...rest,
        },
      });
    }

    for (const edge of edges) {
      elements.push({
        data: {
          source: edge.source,
          target: edge.target,
          label: edge.kind || '',
          graphType: edge.graph,
        },
      });
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // --- Default node ---
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'label': 'data(label)',
            'color': textColor,
            'font-size': '9px',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 3,
            'width': 'data(nodeSize)',
            'height': 'data(nodeSize)',
            'border-width': 1,
            'border-color': borderColor,
            'text-max-width': '80px',
            'text-wrap': 'ellipsis',
            'text-opacity': 0.85,
            'transition-property': 'opacity, border-width, border-color, width, height',
            'transition-duration': '0.15s' as any,
          } as any,
        },
        // --- Default edge ---
        {
          selector: 'edge',
          style: {
            'width': 0.5,
            'line-color': lineColor,
            'target-arrow-color': lineColor,
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 0.4,
            'opacity': 0.6,
            'transition-property': 'opacity, line-color, width',
            'transition-duration': '0.15s' as any,
          } as any,
        },
        // --- Dimmed (non-neighbors when hovering) ---
        {
          selector: 'node.dimmed',
          style: {
            'opacity': 0.1,
            'text-opacity': 0,
          },
        },
        {
          selector: 'edge.dimmed',
          style: {
            'opacity': 0.03,
            'line-color': dimLineColor,
          },
        },
        // --- Highlighted neighbors ---
        {
          selector: 'node.highlighted',
          style: {
            'opacity': 1,
            'text-opacity': 1,
            'border-width': 2,
            'border-color': accentColor,
          } as any,
        },
        {
          selector: 'edge.highlighted',
          style: {
            'opacity': 1,
            'width': 2,
            'line-color': accentColor,
            'target-arrow-color': accentColor,
            'label': 'data(label)',
            'font-size': '7px',
            'color': accentColor,
            'text-rotation': 'autorotate',
            'text-margin-y': -8,
          } as any,
        },
        // --- Selected node ---
        {
          selector: 'node.selected-node',
          style: {
            'border-width': 3,
            'border-color': '#fff',
            'z-index': 999,
          } as any,
        },
        // --- Search match ---
        {
          selector: 'node.search-match',
          style: {
            'border-width': 3,
            'border-color': '#ff0',
            'text-opacity': 1,
            'opacity': 1,
            'z-index': 999,
          } as any,
        },
      ],
      layout: {
        name: 'fcose',
        animate: false,
        quality: nodes.length > 500 ? 'default' : 'proof',
        nodeSeparation: nodes.length > 500 ? 120 : 75,
        nodeRepulsion: () => nodes.length > 500 ? 8000 : 4500,
        idealEdgeLength: () => nodes.length > 500 ? 120 : 80,
        gravity: 0.25,
        gravityRange: 3.8,
        numIter: nodes.length > 500 ? 1500 : 2500,
        tilingPaddingVertical: 20,
        tilingPaddingHorizontal: 20,
        uniformNodeDimensions: false,
        packComponents: true,
      } as any,
      minZoom: 0.05,
      maxZoom: 8,
      wheelSensitivity: 0.3,
      pixelRatio: 1,
    });

    // --- Hover highlight ---
    cy.on('mouseover', 'node', (e) => {
      highlightNode(cy, e.target.id());
    });

    cy.on('mouseout', 'node', () => {
      clearHighlight(cy);
      // Re-apply selected node highlight if any
      if (selected) {
        highlightNode(cy, selected.id);
      }
    });

    // --- Tap select ---
    cy.on('tap', 'node', (e) => {
      const data = e.target.data() as NodeData;
      clearHighlight(cy);
      highlightNode(cy, data.id);
      setSelected(data);
    });

    cy.on('tap', (e) => {
      if (e.target === cy) {
        clearHighlight(cy);
        setSelected(null);
      }
    });

    // --- Focus param ---
    if (focusParam) {
      const focusNode = cy.getElementById(focusParam);
      if (focusNode.length > 0) {
        cy.animate({ center: { eles: focusNode }, zoom: 2 }, { duration: 300 });
        highlightNode(cy, focusParam);
        setSelected(focusNode.data() as NodeData);
      }
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('focus');
        next.delete('scope');
        return next;
      }, { replace: true });
    }

    cyRef.current = cy;
  };

  const loadGraph = useCallback(async (s: GraphScope) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setSelected(null);
    setSearchQuery('');
    try {
      const data = await exportGraph(projectId, s);

      const nodes = data.nodes.filter(n => !n.id.startsWith('@'));
      const nodeIds = new Set(nodes.map(n => n.id));
      const edges = data.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

      setStats({ nodes: nodes.length, edges: edges.length });
      renderGraph(nodes, edges);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadGraph(scope);
    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [loadGraph, scope]);

  // --- Search within graph ---
  const handleGraphSearch = (q: string) => {
    setSearchQuery(q);
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass('search-match dimmed');

    if (!q.trim()) return;

    const lower = q.trim().toLowerCase();
    const matches = cy.nodes().filter(n => {
      const d = n.data();
      return (d.label || '').toLowerCase().includes(lower) ||
             (d.id || '').toLowerCase().includes(lower) ||
             (d.title || '').toLowerCase().includes(lower) ||
             (d.name || '').toLowerCase().includes(lower);
    });

    if (matches.length > 0) {
      cy.elements().not(matches).addClass('dimmed');
      matches.addClass('search-match');
      cy.animate({ fit: { eles: matches, padding: 40 } }, { duration: 300 });
    }
  };

  const handleFit = () => {
    cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 30 } }, { duration: 200 });
  };

  const handleZoomIn = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.animate({ zoom: { level: cy.zoom() * 1.4, position: { x: cy.width() / 2, y: cy.height() / 2 } } }, { duration: 150 });
  };

  const handleZoomOut = () => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.animate({ zoom: { level: cy.zoom() / 1.4, position: { x: cy.width() / 2, y: cy.height() / 2 } } }, { duration: 150 });
  };

  const inspectorFields = selected ? (() => {
    const skip = new Set(['id', 'label', 'color', 'graphType', 'graph', 'embedding', 'fileEmbedding', 'nodeSize']);
    const items: React.ReactNode[] = [];
    for (const [key, value] of Object.entries(selected)) {
      if (skip.has(key) || value == null || value === '') continue;
      if (typeof value === 'object' && !Array.isArray(value)) continue;
      let display: string;
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        display = value.join(', ');
      } else {
        display = String(value);
      }
      items.push(
        <FieldRow key={key} label={key} divider={false}>
          <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
            {display.length > 200 ? display.slice(0, 200) + '\u2026' : display}
          </Typography>
        </FieldRow>
      );
    }
    return items;
  })() : [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 112px)' }}>
      <PageTopBar
        breadcrumbs={[{ label: 'Graph' }]}
        actions={
          <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
            {stats.nodes} nodes · {stats.edges} edges
          </Typography>
        }
      />

      <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <ToggleButtonGroup
          exclusive
          value={scope}
          onChange={(_e, v) => { if (v) setScope(v); }}
          size="small"
        >
          {SCOPE_CONFIG.map(({ scope: s, label, icon }) => (
            <ToggleButton key={s} value={s} sx={{ gap: 0.5, textTransform: 'none' }}>
              {icon}
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <TextField
          size="small"
          placeholder="Find node..."
          value={searchQuery}
          onChange={e => handleGraphSearch(e.target.value)}
          sx={{ width: 200 }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            },
          }}
        />

        <Box sx={{ display: 'flex', gap: 0.25 }}>
          <Tooltip title="Zoom in">
            <IconButton size="small" onClick={handleZoomIn}><ZoomInIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Zoom out">
            <IconButton size="small" onClick={handleZoomOut}><ZoomOutIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Tooltip title="Fit to screen">
            <IconButton size="small" onClick={handleFit}><CenterFocusStrongIcon fontSize="small" /></IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flex: 1, gap: 2, minHeight: 0 }}>
        <Paper
          variant="outlined"
          sx={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 400, bgcolor: bgColor }}
        >
          {loading && (
            <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 1 }}>
              <CircularProgress />
            </Box>
          )}
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

          {/* Legend */}
          <Box sx={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {Object.entries(GRAPH_COLORS).map(([name, color]) => (
              <Chip
                key={name}
                label={name}
                size="small"
                sx={{
                  height: 22, fontSize: 10, fontWeight: 600,
                  bgcolor: `${color}33`, color, border: `1px solid ${color}66`,
                  opacity: scope === 'all' || scope === (name as GraphScope) ? 1 : 0.3,
                }}
              />
            ))}
          </Box>
        </Paper>

        {selected && (
          <Box sx={{ width: 280, flexShrink: 0, overflow: 'auto' }}>
            <Section title="Node Inspector">
              <Box sx={{ mb: 1 }}>
                <StatusBadge
                  label={selected.graphType}
                  color={GRAPH_BADGE_COLOR[selected.graphType] ?? 'neutral'}
                />
              </Box>
              <Typography variant="body1" fontWeight={600} gutterBottom>
                {getNodeLabel(selected)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
                <Typography variant="caption" sx={{ wordBreak: 'break-all', color: palette.custom.textMuted }}>
                  {selected.id}
                </Typography>
                <CopyButton value={selected.id} />
              </Box>
              {inspectorFields}
            </Section>
          </Box>
        )}
      </Box>
    </Box>
  );
}
