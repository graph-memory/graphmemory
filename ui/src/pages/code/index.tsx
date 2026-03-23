import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, InputAdornment, Alert, CircularProgress,
  List, ListItemButton, ListItemIcon, ListItemText, IconButton,
  Collapse, Stack, Chip, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { PageTopBar, FilterBar, StatusBadge, EmptyState } from '@/shared/ui/index.ts';
import {
  listCodeFiles, getFileSymbols, searchCode,
  type CodeFile, type CodeSymbol, type CodeSearchResult,
} from '@/entities/code/index.ts';

type ChipColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'default';

const KIND_COLORS = {
  function: 'primary', class: 'warning', method: 'info', constructor: 'info',
  interface: 'secondary', type: 'secondary', enum: 'success', variable: 'success', file: 'error',
} as const;

function kindColor(kind: string): ChipColor {
  return (KIND_COLORS as Record<string, ChipColor>)[kind] ?? 'default';
}

export default function CodePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();

  const [files, setFiles] = useState<CodeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<CodeSymbol[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<CodeSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const loadFiles = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await listCodeFiles(projectId, { limit: 500 });
      setFiles(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleToggle = async (fileId: string) => {
    if (expandedFile === fileId) {
      setExpandedFile(null);
      return;
    }
    setExpandedFile(fileId);
    setSymbolsLoading(true);
    try {
      const syms = await getFileSymbols(projectId!, fileId);
      setSymbols(syms);
    } catch {
      setSymbols([]);
    } finally {
      setSymbolsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!projectId || !search.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchCode(projectId, search.trim(), { topK: 20, minScore: 0.1 });
      setSearchResults(results);
    } catch { /* ignore */ } finally {
      setSearching(false);
    }
  };

  const handleClearSearch = () => {
    setSearch('');
    setSearchResults(null);
  };

  const totalSymbols = files.reduce((sum, f) => sum + f.symbolCount, 0);

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Code' }]}
        actions={
          <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
            {files.length} files · {totalSymbols} symbols
          </Typography>
        }
      />

      <FilterBar>
        <TextField
          fullWidth size="small"
          placeholder="Semantic search code..."
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading || searching ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : searchResults ? (
        <List disablePadding>
          {searchResults.map(result => (
            <ListItemButton
              key={result.id}
              onClick={() => navigate(encodeURIComponent(result.id))}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <CodeIcon fontSize="small" color="secondary" />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" fontWeight={600}>{result.name}</Typography>
                    <Chip label={result.kind} size="small" color={kindColor(result.kind)} variant="outlined" />
                    <StatusBadge label={`${(result.score * 100).toFixed(0)}%`} color="primary" size="small" />
                  </Box>
                }
                secondary={
                  result.content ? (
                    <Typography
                      variant="caption"
                      sx={{ color: palette.custom.textMuted, fontFamily: 'monospace', fontSize: '0.75rem' }}
                      noWrap
                    >
                      {result.content.slice(0, 120)}
                    </Typography>
                  ) : undefined
                }
              />
            </ListItemButton>
          ))}
        </List>
      ) : files.length === 0 ? (
        <EmptyState
          icon={<CodeIcon />}
          title="No code indexed"
          description="Configure code graph patterns in graph-memory.yaml to start indexing source code"
        />
      ) : (
        <List disablePadding>
          {files.map(file => (
            <Box key={file.fileId}>
              <ListItemButton onClick={() => handleToggle(file.fileId)} sx={{ borderRadius: 1 }}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {expandedFile === file.fileId ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                </ListItemIcon>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <InsertDriveFileIcon fontSize="small" color="secondary" />
                </ListItemIcon>
                <ListItemText
                  primary={<Typography variant="body2" fontWeight={600}>{file.fileId}</Typography>}
                  secondary={
                    <Typography variant="caption" sx={{ color: palette.custom.textMuted }}>
                      {file.symbolCount} symbol{file.symbolCount !== 1 ? 's' : ''}
                    </Typography>
                  }
                />
              </ListItemButton>

              <Collapse in={expandedFile === file.fileId} timeout="auto" unmountOnExit>
                {symbolsLoading ? (
                  <Box sx={{ pl: 9, py: 1 }}><CircularProgress size={16} /></Box>
                ) : (
                  <List disablePadding sx={{ pl: 4 }}>
                    {symbols.filter(s => s.kind !== 'file').map(sym => (
                      <ListItemButton
                        key={sym.id}
                        onClick={() => navigate(encodeURIComponent(sym.id))}
                        sx={{ borderRadius: 1, py: 0.5 }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <CodeIcon fontSize="small" sx={{ opacity: 0.5 }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="body2">{sym.name}</Typography>
                              <Chip
                                label={sym.kind}
                                size="small"
                                color={kindColor(sym.kind)}
                                variant="outlined"
                              />
                              {sym.isExported && (
                                <Chip label="export" size="small" variant="outlined" />
                              )}
                            </Stack>
                          }
                          secondary={
                            <Typography
                              variant="caption"
                              sx={{ color: palette.custom.textMuted, fontFamily: 'monospace', fontSize: '0.75rem' }}
                              noWrap
                            >
                              {sym.signature}
                            </Typography>
                          }
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
    </Box>
  );
}
