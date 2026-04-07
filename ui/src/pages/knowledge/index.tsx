import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Button, TextField, InputAdornment, Alert, CircularProgress,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, FilterBar, EmptyState, PaginationBar, ConfirmDialog } from '@/shared/ui/index.ts';
import { PAGE_SIZE } from '@/shared/lib/usePagination.ts';
import { searchNotes, deleteNote, type Note, NoteCard } from '@/entities/note/index.ts';
import { useNotes } from '@/features/note-crud/index.ts';

export default function KnowledgePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = useCanWrite('knowledge');
  const { notes, page, setPage, totalPages, loading, error, refresh } = useNotes(projectId ?? null, PAGE_SIZE);

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [searchResults, setSearchResults] = useState<Array<Note & { score: number }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('note:')) refresh();
  }, [refresh]));

  const doSearch = useCallback(async (q: string) => {
    if (!projectId || !q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchNotes(projectId, q.trim());
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

  const displayNotes = searchResults ?? notes;

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Knowledge' }]}
        actions={
          canWrite ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('new')}>
              New Note
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <TextField
          fullWidth
          size="small"
          placeholder="Semantic search notes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start"><SearchIcon /></InputAdornment>
              ),
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
        <Box sx={{ mb: 1, color: 'text.secondary', fontSize: '0.75rem' }}>
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
        </Box>
      )}

      {!searchResults && (
        <Box sx={{ mb: 2 }}>
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} onRefresh={refresh} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading || searching ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : displayNotes.length === 0 ? (
        <EmptyState
          icon={<LightbulbOutlinedIcon />}
          title={searchResults ? 'No matching notes found' : 'No notes yet'}
          description={searchResults ? 'Try a different search query' : 'Create your first note to get started'}
          action={
            !searchResults && canWrite ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('new')}>
                New Note
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          {displayNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              score={'score' in note ? (note as Note & { score: number }).score : undefined}
              onClick={() => navigate(String(note.id))}
              onEdit={canWrite ? () => navigate(`${note.id}/edit`) : undefined}
              onDelete={canWrite ? () => setDeleteTarget(note) : undefined}
            />
          ))}
        </Box>
      )}

      {!searchResults && (
        <Box sx={{ mt: 2 }}>
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} onRefresh={refresh} />
        </Box>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete note"
        message={`Delete "${deleteTarget?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!projectId || !deleteTarget) return;
          setDeleting(true);
          try {
            await deleteNote(projectId, deleteTarget.id);
            setDeleteTarget(null);
            refresh();
          } finally {
            setDeleting(false);
          }
        }}
      />
    </Box>
  );
}
