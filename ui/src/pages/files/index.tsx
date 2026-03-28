import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment, Paper, List, ListItemButton,
  ListItemIcon, ListItemText, Breadcrumbs, Link, Alert, CircularProgress,
  Stack, Chip, useTheme,
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SearchIcon from '@mui/icons-material/Search';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { PageTopBar, FilterBar, StatusBadge, EmptyState, PaginationBar } from '@/shared/ui/index.ts';
import { usePagination, PAGE_SIZE } from '@/shared/lib/usePagination.ts';
import { listFiles, searchFiles, type FileInfo } from '@/entities/file/index.ts';

function formatSize(bytes?: number) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FilesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDir, setCurrentDir] = useState(searchParams.get('dir') || '.');
  const { page, setPage, setTotal, totalPages, offset, pageSize } = usePagination(PAGE_SIZE);
  const [searchResults, setSearchResults] = useState<Array<FileInfo & { score: number }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState(searchParams.get('q') || '');

  const updateDirParam = (dir: string) => {
    const next = new URLSearchParams(searchParams);
    if (dir && dir !== '.') next.set('dir', dir); else next.delete('dir');
    next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const loadFiles = useCallback(async (dir: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const { items, total: t } = await listFiles(projectId, { directory: dir || '.', limit: pageSize, offset });
      setFiles(items);
      setTotal(t);
      setCurrentDir(dir);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, pageSize, offset, setTotal]);

  useEffect(() => { loadFiles(searchParams.get('dir') || '.'); }, [loadFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = useCallback(async (q: string) => {
    if (!projectId || !q.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const results = await searchFiles(projectId, q.trim());
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

  const handleNavigate = (file: FileInfo) => {
    if (file.kind === 'directory') {
      setSearchResults(null);
      setPage(1);
      updateDirParam(file.filePath);
      loadFiles(file.filePath);
    } else {
      navigate(`/${projectId}/files/view/${file.filePath}`);
    }
  };

  const handleBreadcrumb = (path: string) => {
    setSearchResults(null);
    setPage(1);
    updateDirParam(path);
    loadFiles(path);
  };

  const goUp = () => {
    const parts = currentDir.split('/').slice(0, -1);
    handleBreadcrumb(parts.length > 0 ? parts.join('/') : '.');
  };

  const breadcrumbs = currentDir && currentDir !== '.' ? currentDir.split('/') : [];
  const displayFiles = searchResults ?? files;

  const sorted = [...displayFiles].sort((a, b) => {
    if (a.kind === 'directory' && b.kind !== 'directory') return -1;
    if (a.kind !== 'directory' && b.kind === 'directory') return 1;
    return a.filePath.localeCompare(b.filePath);
  });

  return (
    <Box>
      <PageTopBar breadcrumbs={[{ label: 'Files' }]} />

      <FilterBar>
        <TextField
          fullWidth size="small"
          placeholder="Search files..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            },
          }}
        />
      </FilterBar>

      {!searchResults && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          {currentDir && currentDir !== '.' && (
            <Chip icon={<ArrowUpwardIcon />} label="Up" size="small" onClick={goUp} clickable />
          )}
          <Breadcrumbs>
            <Link
              component="button"
              variant="body2"
              underline="hover"
              onClick={() => handleBreadcrumb('.')}
              color={!currentDir || currentDir === '.' ? 'text.primary' : 'inherit'}
            >
              root
            </Link>
            {breadcrumbs.map((part, i) => {
              const bcPath = breadcrumbs.slice(0, i + 1).join('/');
              const isLast = i === breadcrumbs.length - 1;
              return (
                <Link
                  key={bcPath}
                  component="button"
                  variant="body2"
                  underline={isLast ? 'none' : 'hover'}
                  onClick={() => !isLast && handleBreadcrumb(bcPath)}
                  color={isLast ? 'text.primary' : 'inherit'}
                >
                  {part}
                </Link>
              );
            })}
          </Breadcrumbs>
        </Box>
      )}

      {searchResults && (
        <Typography variant="caption" sx={{ color: palette.custom.textMuted, mb: 1, display: 'block' }}>
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
          {' '}<Link component="button" onClick={() => { setSearch(''); setSearchResults(null); const n = new URLSearchParams(searchParams); n.delete('q'); setSearchParams(n, { replace: true }); }}>clear</Link>
        </Typography>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading || searching ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<FolderOpenIcon />}
          title={searchResults ? 'No files found' : 'Empty directory'}
          description={searchResults ? 'Try a different search query' : undefined}
        />
      ) : (
        <Paper variant="outlined">
          <List dense disablePadding>
            {sorted.map((file) => (
              <ListItemButton
                key={file.filePath}
                onClick={() => handleNavigate(file)}
                sx={{ borderBottom: `1px solid ${palette.custom.border}` }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {file.kind === 'directory' ? (
                    <FolderIcon sx={{ color: '#f9a825' }} />
                  ) : (
                    <InsertDriveFileIcon sx={{ color: palette.custom.textMuted }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>{searchResults ? file.filePath : file.fileName}</span>
                      {'score' in file && (
                        <StatusBadge label={`${((file as FileInfo & { score: number }).score * 100).toFixed(0)}%`} color="primary" size="small" />
                      )}
                    </Box>
                  }
                />
                <Stack direction="row" spacing={1} alignItems="center">
                  {file.language && (
                    <Typography variant="caption" sx={{ color: palette.custom.textMuted }}>{file.language}</Typography>
                  )}
                  <Typography variant="caption" sx={{ color: palette.custom.textMuted, minWidth: 60, textAlign: 'right' }}>
                    {file.kind === 'directory'
                      ? (file.fileCount > 0 ? `${file.fileCount} files` : '')
                      : formatSize(file.size)
                    }
                  </Typography>
                </Stack>
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {!searchResults && (
        <Box sx={{ mt: 2 }}>
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} onRefresh={() => loadFiles(currentDir)} />
        </Box>
      )}
    </Box>
  );
}
