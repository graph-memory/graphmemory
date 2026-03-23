import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment, ToggleButtonGroup, ToggleButton,
  Card, CardContent, Stack, CircularProgress, Alert, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import ViewKanbanIcon from '@mui/icons-material/ViewKanban';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import CodeIcon from '@mui/icons-material/Code';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { searchNotes } from '@/entities/note/index.ts';
import { searchTasks } from '@/entities/task/index.ts';
import { searchSkills } from '@/entities/skill/index.ts';
import { searchFiles } from '@/entities/file/index.ts';
import { searchDocs } from '@/entities/doc/index.ts';
import { searchCode } from '@/entities/code/index.ts';
import { PageTopBar, FilterBar, StatusBadge, Tags, EmptyState } from '@/shared/ui/index.ts';

type SearchScope = 'knowledge' | 'tasks' | 'skills' | 'files' | 'docs' | 'code';

interface SearchResult {
  id: string;
  scope: SearchScope;
  title: string;
  subtitle?: string;
  score: number;
  tags?: string[];
}

const SCOPE_CONFIG: Record<SearchScope, { label: string; icon: React.ReactNode; badgeColor: 'warning' | 'primary' | 'success' | 'neutral' | 'error' }> = {
  knowledge: { label: 'Knowledge', icon: <LightbulbIcon />, badgeColor: 'warning' },
  tasks:     { label: 'Tasks',     icon: <ViewKanbanIcon />, badgeColor: 'primary' },
  skills:    { label: 'Skills',    icon: <PsychologyIcon />, badgeColor: 'neutral' },
  files:     { label: 'Files',     icon: <FolderIcon />,     badgeColor: 'success' },
  docs:      { label: 'Docs',      icon: <DescriptionIcon />, badgeColor: 'neutral' },
  code:      { label: 'Code',      icon: <CodeIcon />,       badgeColor: 'error' },
};

function getResultPath(projectId: string, r: SearchResult): string | null {
  if (r.scope === 'knowledge') return `/${projectId}/knowledge/${r.id}`;
  if (r.scope === 'tasks') return `/${projectId}/tasks/${r.id}`;
  if (r.scope === 'skills') return `/${projectId}/skills/${r.id}`;
  if (r.scope === 'files') return `/${projectId}/files/view/${r.id}`;
  if (r.scope === 'docs') return `/${projectId}/docs/${encodeURIComponent(r.id)}`;
  if (r.scope === 'code') return `/${projectId}/code/${encodeURIComponent(r.id)}`;
  return null;
}

const ALL_SCOPES: SearchScope[] = ['knowledge', 'tasks', 'skills', 'files', 'docs', 'code'];

function parseScopesParam(value: string | null): SearchScope[] {
  if (!value) return ALL_SCOPES;
  const parsed = value.split(',').filter((s): s is SearchScope => s in SCOPE_CONFIG);
  return parsed.length > 0 ? parsed : ALL_SCOPES;
}

export default function SearchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [scopes, setScopes] = useState<SearchScope[]>(parseScopesParam(searchParams.get('scopes')));

  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (q: string, sc: SearchScope[]) => {
    if (!projectId || !q.trim()) return;
    setSearching(true);
    setError(null);
    setSearched(true);
    const allResults: SearchResult[] = [];
    const searchOpts = { topK: 20, minScore: 0.1 };
    const trimmed = q.trim();

    try {
      const promises: Promise<void>[] = [];

      if (sc.includes('knowledge')) {
        promises.push(
          searchNotes(projectId, trimmed, searchOpts).then(notes => {
            for (const n of notes) allResults.push({
              id: n.id, scope: 'knowledge', title: n.title,
              subtitle: n.content?.slice(0, 120), score: n.score, tags: n.tags,
            });
          }).catch(() => {})
        );
      }
      if (sc.includes('tasks')) {
        promises.push(
          searchTasks(projectId, trimmed, searchOpts).then(tasks => {
            for (const t of tasks) allResults.push({
              id: t.id, scope: 'tasks', title: t.title,
              subtitle: `${t.status} / ${t.priority}${t.description ? ' — ' + t.description.slice(0, 80) : ''}`,
              score: t.score, tags: t.tags,
            });
          }).catch(() => {})
        );
      }
      if (sc.includes('skills')) {
        promises.push(
          searchSkills(projectId, trimmed, searchOpts).then(skills => {
            for (const s of skills) allResults.push({
              id: s.id, scope: 'skills', title: s.title,
              subtitle: `${s.source} / ${Math.round(s.confidence * 100)}%${s.description ? ' — ' + s.description.slice(0, 80) : ''}`,
              score: s.score, tags: s.tags,
            });
          }).catch(() => {})
        );
      }
      if (sc.includes('files')) {
        promises.push(
          searchFiles(projectId, trimmed, searchOpts).then(files => {
            for (const f of files) allResults.push({
              id: f.filePath, scope: 'files', title: f.filePath,
              subtitle: [f.language, f.size ? `${(f.size / 1024).toFixed(1)} KB` : ''].filter(Boolean).join(' / '),
              score: f.score,
            });
          }).catch(() => {})
        );
      }
      if (sc.includes('docs')) {
        promises.push(
          searchDocs(projectId, trimmed, searchOpts).then(docs => {
            for (const d of docs) allResults.push({
              id: d.id, scope: 'docs', title: d.title || d.id,
              subtitle: d.content?.slice(0, 120), score: d.score,
            });
          }).catch(() => {})
        );
      }
      if (sc.includes('code')) {
        promises.push(
          searchCode(projectId, trimmed, searchOpts).then(symbols => {
            for (const s of symbols) allResults.push({
              id: s.id, scope: 'code', title: s.name || s.id,
              subtitle: `${s.kind}${s.content ? ' — ' + s.content.slice(0, 80) : ''}`, score: s.score,
            });
          }).catch(() => {})
        );
      }

      await Promise.all(promises);
      allResults.sort((a, b) => b.score - a.score);
      setResults(allResults);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }, [projectId]);

  useEffect(() => {
    const q = searchParams.get('q');
    const sc = parseScopesParam(searchParams.get('scopes'));
    if (q?.trim()) doSearch(q, sc);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    const next = new URLSearchParams();
    if (query.trim()) next.set('q', query.trim());
    const isAll = scopes.length === ALL_SCOPES.length && ALL_SCOPES.every(s => scopes.includes(s));
    if (!isAll) next.set('scopes', scopes.join(','));
    setSearchParams(next, { replace: true });
    doSearch(query, scopes);
  };

  const handleResultClick = (r: SearchResult) => {
    if (!projectId) return;
    const path = getResultPath(projectId, r);
    if (path) navigate(path);
  };

  return (
    <Box>
      <PageTopBar breadcrumbs={[{ label: 'Search' }]} />

      <FilterBar>
        <TextField
          fullWidth size="small"
          placeholder="Search across all graphs..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            },
          }}
        />
      </FilterBar>

      <ToggleButtonGroup
        value={scopes}
        onChange={(_e, v) => { if (v.length > 0) setScopes(v); }}
        size="small"
        sx={{ mb: 3, flexWrap: 'wrap' }}
      >
        {(Object.keys(SCOPE_CONFIG) as SearchScope[]).map(scope => (
          <ToggleButton key={scope} value={scope} sx={{ gap: 0.5, textTransform: 'none' }}>
            {SCOPE_CONFIG[scope].icon}
            {SCOPE_CONFIG[scope].label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {searching ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : results.length === 0 && searched ? (
        <EmptyState
          icon={<SearchIcon />}
          title="No results found"
          description="Try a different query or broaden your scope filters"
        />
      ) : (
        <Stack spacing={1.5}>
          {results.map((r, i) => {
            const config = SCOPE_CONFIG[r.scope];
            const clickable = getResultPath(projectId!, r) !== null;
            return (
              <Card
                key={`${r.scope}-${r.id}-${i}`}
                variant="outlined"
                onClick={clickable ? () => handleResultClick(r) : undefined}
                sx={clickable ? { cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } } : {}}
              >
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <StatusBadge
                      label={config.label}
                      color={config.badgeColor}
                      icon={config.icon as React.ReactElement}
                    />
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>{r.title}</Typography>
                    <StatusBadge label={`${(r.score * 100).toFixed(0)}%`} color="primary" size="small" />
                  </Box>
                  {r.subtitle && (
                    <Typography variant="caption" sx={{ display: 'block', color: palette.custom.textMuted }}>
                      {r.subtitle}
                    </Typography>
                  )}
                  {r.tags && r.tags.length > 0 && (
                    <Box sx={{ mt: 0.5 }}>
                      <Tags tags={r.tags} />
                    </Box>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
