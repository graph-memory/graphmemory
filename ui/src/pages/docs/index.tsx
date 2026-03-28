import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment, Alert, CircularProgress,
  List, ListItemButton, ListItemIcon, ListItemText, IconButton,
  Collapse, Stack, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArticleIcon from '@mui/icons-material/Article';
import { PageTopBar, FilterBar, StatusBadge, EmptyState, PaginationBar } from '@/shared/ui/index.ts';
import { usePagination, PAGE_SIZE } from '@/shared/lib/usePagination.ts';
import { listTopics, getToc, searchDocs, type DocTopic, type DocChunk } from '@/entities/doc/index.ts';

export default function DocsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { palette } = useTheme();

  const [topics, setTopics] = useState<DocTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { page, setPage, total, setTotal, totalPages, offset, pageSize } = usePagination(PAGE_SIZE);

  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [toc, setToc] = useState<DocChunk[]>([]);
  const [tocLoading, setTocLoading] = useState(false);

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [searchResults, setSearchResults] = useState<Array<DocChunk & { score: number }> | null>(null);
  const [searching, setSearching] = useState(false);

  const loadTopics = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { items, total: t } = await listTopics(projectId, { limit: pageSize, offset });
      setTopics(items);
      setTotal(t);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, pageSize, offset, setTotal]);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  const handleToggle = async (fileId: string) => {
    if (expandedFile === fileId) {
      setExpandedFile(null);
      return;
    }
    setExpandedFile(fileId);
    setTocLoading(true);
    try {
      const chunks = await getToc(projectId!, fileId);
      setToc(chunks);
    } catch {
      setToc([]);
    } finally {
      setTocLoading(false);
    }
  };

  const doSearch = useCallback(async (q: string) => {
    if (!projectId || !q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchDocs(projectId, q.trim(), { topK: 20, minScore: 0.1 });
      setSearchResults(results);
    } catch { /* ignore */ } finally {
      setSearching(false);
    }
  }, [projectId]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q?.trim()) doSearch(q);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    const next = new URLSearchParams(searchParams);
    if (search.trim()) next.set('q', search.trim()); else next.delete('q');
    setSearchParams(next, { replace: true });
    doSearch(search);
  };

  const handleClearSearch = () => {
    setSearch('');
    setSearchResults(null);
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
  };

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Docs' }]}
        actions={
          <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
            {total} files
          </Typography>
        }
      />

      <FilterBar>
        <TextField
          fullWidth size="small"
          placeholder="Semantic search docs..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
              endAdornment: search && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={handleClearSearch}><CloseIcon /></IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
      </FilterBar>

      {searchResults && (
        <Typography variant="caption" sx={{ color: palette.custom.textMuted, mb: 1, display: 'block' }}>
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
        </Typography>
      )}

      {!searchResults && (
        <Box sx={{ mb: 2 }}>
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} onRefresh={loadTopics} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading || searching ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : searchResults ? (
        <List disablePadding>
          {searchResults.map(chunk => (
            <ListItemButton
              key={chunk.id}
              onClick={() => navigate(encodeURIComponent(chunk.id))}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <ArticleIcon fontSize="small" color="secondary" />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{chunk.title || chunk.id}</Typography>
                    <StatusBadge label={`${(chunk.score * 100).toFixed(0)}%`} color="primary" size="small" />
                  </Box>
                }
                secondary={
                  <Typography variant="caption" sx={{ color: palette.custom.textMuted }} noWrap>
                    {chunk.fileId} · level {chunk.level}
                    {chunk.content ? ` · ${chunk.content.slice(0, 100)}` : ''}
                  </Typography>
                }
              />
            </ListItemButton>
          ))}
        </List>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<DescriptionIcon />}
          title="No docs indexed"
          description="Configure docsPattern in graph-memory.yaml to start indexing documentation"
        />
      ) : (
        <List disablePadding>
          {topics.map(topic => (
            <Box key={topic.fileId}>
              <ListItemButton onClick={() => handleToggle(topic.fileId)} sx={{ borderRadius: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {expandedFile === topic.fileId ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                </ListItemIcon>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <DescriptionIcon fontSize="small" color="secondary" />
                </ListItemIcon>
                <ListItemText
                  primary={<Typography variant="body2" fontWeight={600}>{topic.title || topic.fileId}</Typography>}
                  secondary={<Typography variant="caption" sx={{ color: palette.custom.textMuted }}>{topic.fileId} · {topic.chunks} chunks</Typography>}
                />
              </ListItemButton>

              <Collapse in={expandedFile === topic.fileId} timeout="auto" unmountOnExit>
                {tocLoading ? (
                  <Box sx={{ pl: 9, py: 1 }}><CircularProgress size={16} /></Box>
                ) : (
                  <List disablePadding sx={{ pl: 4 }}>
                    {toc.map(chunk => (
                      <ListItemButton
                        key={chunk.id}
                        onClick={() => navigate(encodeURIComponent(chunk.id))}
                        sx={{ borderRadius: 1, py: 0.5 }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <ArticleIcon fontSize="small" sx={{ opacity: 0.5 }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2" sx={{ pl: (chunk.level - 1) * 2 }}>
                                {chunk.title || chunk.id}
                              </Typography>
                              {chunk.language && (
                                <StatusBadge label={chunk.language} color="primary" size="small" />
                              )}
                            </Stack>
                          }
                          secondary={chunk.content ? (
                            <Typography
                              variant="caption"
                              sx={{ color: palette.custom.textMuted, pl: (chunk.level - 1) * 2 }}
                              noWrap
                            >
                              {chunk.content.slice(0, 120)}
                            </Typography>
                          ) : undefined}
                        />
                      </ListItemButton>
                    ))}
                  </List>
                )}
              </Collapse>
            </Box>
          ))}
        </List>
      )}

      {!searchResults && (
        <Box sx={{ mt: 2 }}>
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} onRefresh={loadTopics} />
        </Box>
      )}
    </Box>
  );
}
