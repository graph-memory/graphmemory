import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, IconButton, TextField, Button, Select, MenuItem,
  FormControl, InputLabel, List, ListItem, ListItemText, CircularProgress,
  Divider, Paper, Link, useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { createRelation, deleteRelation, type Relation } from '@/entities/note/index.ts';
import { createTaskLink, deleteTaskLink, type TaskRelation } from '@/entities/task/index.ts';
import { searchNotes } from '@/entities/note/index.ts';
import { searchTasks } from '@/entities/task/index.ts';
import { searchDocs } from '@/entities/doc/index.ts';
import { searchCode } from '@/entities/code/index.ts';
import { searchFiles } from '@/entities/file/index.ts';
import { searchSkills } from '@/entities/skill/index.ts';
import { createSkillLink, deleteSkillLink, type SkillRelation } from '@/entities/skill/index.ts';
import { StatusBadge, ConfirmDialog } from '@/shared/ui/index.ts';

const TARGET_GRAPHS = ['knowledge', 'tasks', 'skills', 'docs', 'code', 'files'] as const;

const GRAPH_BADGE_COLOR: Record<string, 'warning' | 'primary' | 'success' | 'neutral' | 'error'> = {
  knowledge: 'warning',
  tasks: 'primary',
  skills: 'neutral',
  files: 'success',
  docs: 'neutral',
  code: 'error',
};

interface SearchResult {
  id: number;
  label: string;
  score: number;
}

interface RelationManagerProps {
  projectId: string;
  entityId: string;
  entityType: 'knowledge' | 'tasks' | 'skills';
  relations: (Relation | TaskRelation | SkillRelation)[];
  onRefresh: () => void;
}

function getNavigationPath(projectId: string, graph: string, targetId: string | number): string | null {
  if (graph === 'knowledge') return `/${projectId}/knowledge/${targetId}`;
  if (graph === 'tasks') return `/${projectId}/tasks/${targetId}`;
  if (graph === 'skills') return `/${projectId}/skills/${targetId}`;
  if (graph === 'files') return `/${projectId}/files/view/${targetId}`;
  if (graph === 'docs') return `/${projectId}/docs/${encodeURIComponent(targetId)}`;
  if (graph === 'code') return `/${projectId}/code/${encodeURIComponent(targetId)}`;
  return null;
}

export function RelationManager({ projectId, entityId, entityType, relations, onRefresh }: RelationManagerProps) {
  const navigate = useNavigate();
  const { palette } = useTheme();
  const { projectId: routeProjectId } = useParams();
  const pid = routeProjectId || projectId;

  const [showAdd, setShowAdd] = useState(false);
  const [targetGraph, setTargetGraph] = useState<string>('knowledge');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<SearchResult | null>(null);
  const [kind, setKind] = useState('relates_to');
  const [creating, setCreating] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<(Relation | TaskRelation | SkillRelation) | null>(null);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSelectedTarget(null);
    try {
      let results: SearchResult[] = [];
      const q = searchQuery.trim();
      const toResult = (r: { id: number; label: string; score: number }) => ({
        id: r.id, label: r.label || String(r.id), score: r.score,
      });
      if (targetGraph === 'knowledge') {
        results = (await searchNotes(projectId, q, { topK: 10 })).map(toResult);
      } else if (targetGraph === 'tasks') {
        results = (await searchTasks(projectId, q, { topK: 10 })).map(toResult);
      } else if (targetGraph === 'docs') {
        results = (await searchDocs(projectId, q, { topK: 10 })).map(toResult);
      } else if (targetGraph === 'code') {
        results = (await searchCode(projectId, q, { topK: 10 })).map(toResult);
      } else if (targetGraph === 'skills') {
        results = (await searchSkills(projectId, q, { topK: 10 })).map(toResult);
      } else if (targetGraph === 'files') {
        results = (await searchFiles(projectId, q, { topK: 10 })).map(toResult);
      }
      setSearchResults(results);
    } catch { /* ignore */ } finally {
      setSearching(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedTarget) return;
    setCreating(true);
    try {
      const tg = targetGraph === entityType ? undefined : targetGraph;
      const fromId = Number(entityId);
      const toId = Number(selectedTarget.id);
      if (entityType === 'knowledge') {
        await createRelation(projectId, { fromId, toId, kind, targetGraph: tg });
      } else if (entityType === 'skills') {
        await createSkillLink(projectId, { fromId, toId, kind, targetGraph: tg });
      } else {
        await createTaskLink(projectId, { fromId, toId, kind, targetGraph: tg });
      }
      setShowAdd(false);
      setSearchQuery('');
      setSearchResults([]);
      setSelectedTarget(null);
      setKind('relates_to');
      onRefresh();
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteConfirm) return;
    const rel = deleteConfirm;
    setDeleteConfirm(null);
    // Backend matches the edge by (fromId, toId, fromGraph, toGraph, kind),
    // so all of these must come from the original edge — not the
    // target-perspective view. Without `kind` the SQL DELETE silently affects
    // 0 rows. `targetGraph` must be `undefined` when the edge is within the
    // same graph as the entity, because the DELETE Zod schema's enum excludes
    // the entity's own graph (mirrors the guard in handleCreate above).
    const tg = rel.toGraph === entityType ? undefined : rel.toGraph;
    const payload = { fromId: rel.fromId, toId: rel.toId, kind: rel.kind, targetGraph: tg };
    try {
      if (entityType === 'knowledge') {
        await deleteRelation(projectId, payload);
      } else if (entityType === 'skills') {
        await deleteSkillLink(projectId, payload);
      } else {
        await deleteTaskLink(projectId, payload);
      }
      onRefresh();
    } catch { /* ignore */ }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Typography variant="subtitle2" sx={{ color: palette.custom.textMuted }}>Relations</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : 'Add'}
        </Button>
      </Box>

      {relations.length === 0 && !showAdd && (
        <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>No relations</Typography>
      )}

      {relations.length > 0 && (
        <List dense disablePadding>
          {relations.map((rel, i) => {
            const targetId = rel.targetId;
            const graph = rel.targetGraph;
            // For cross-project edges (e.g. shared knowledge → project-scoped code),
            // route to the project that actually owns the target node, not the
            // current page's project.
            const navProject = rel.targetProjectSlug ?? pid;
            const navPath = getNavigationPath(navProject, graph, targetId);
            const displayLabel = rel.title || String(targetId);
            return (
              <ListItem
                key={`${rel.fromId}-${rel.toId}-${rel.kind}-${i}`}
                disablePadding
                secondaryAction={
                  <IconButton size="small" onClick={() => setDeleteConfirm(rel)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                }
                sx={{ py: 0.5 }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      <StatusBadge label={rel.kind} color="neutral" size="small" />
                      <StatusBadge label={graph} color={GRAPH_BADGE_COLOR[graph] ?? 'neutral'} size="small" />
                      {navPath ? (
                        <Link
                          href={navPath}
                          variant="body2"
                          underline="hover"
                          onClick={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); navigate(navPath); }}
                        >
                          {displayLabel}
                        </Link>
                      ) : (
                        <Typography variant="body2">{displayLabel}</Typography>
                      )}
                    </Box>
                  }
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <ConfirmDialog
        open={deleteConfirm !== null}
        title="Delete Relation"
        message={`Remove ${deleteConfirm?.kind} link to ${deleteConfirm ? (deleteConfirm.title || String(deleteConfirm.targetId)) : ''}?`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteConfirm(null)}
      />

      {showAdd && (
        <Paper variant="outlined" sx={{ p: 2, mt: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Graph</InputLabel>
              <Select value={targetGraph} label="Graph" onChange={e => { setTargetGraph(e.target.value); setSearchResults([]); setSelectedTarget(null); }}>
                {TARGET_GRAPHS.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small" fullWidth placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
            <IconButton onClick={handleSearch} disabled={searching}>
              {searching ? <CircularProgress size={20} /> : <SearchIcon />}
            </IconButton>
          </Box>

          {searchResults.length > 0 && (
            <Box sx={{ maxHeight: 200, overflow: 'auto', mb: 1.5 }}>
              {searchResults.map(r => (
                <Box
                  key={r.id}
                  onClick={() => setSelectedTarget(r)}
                  sx={{
                    p: 0.75, cursor: 'pointer', borderRadius: 1,
                    backgroundColor: selectedTarget?.id === r.id ? 'action.selected' : 'transparent',
                    '&:hover': { backgroundColor: 'action.hover' },
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>{r.label}</Typography>
                  <StatusBadge label={`${(r.score * 100).toFixed(0)}%`} color="primary" size="small" />
                </Box>
              ))}
            </Box>
          )}

          {selectedTarget && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <StatusBadge label={selectedTarget.label} color="primary" />
                <TextField
                  size="small" label="Kind" value={kind}
                  onChange={e => setKind(e.target.value)}
                  sx={{ width: 160 }}
                />
                <Button variant="contained" size="small" onClick={handleCreate} disabled={creating || !kind.trim()}>
                  {creating ? <CircularProgress size={16} /> : 'Link'}
                </Button>
              </Box>
            </>
          )}
        </Paper>
      )}
    </Box>
  );
}
