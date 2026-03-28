import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Button, TextField, Stack, InputAdornment, Alert, CircularProgress,
  IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, FilterBar, EmptyState, PaginationBar } from '@/shared/ui/index.ts';
import { PAGE_SIZE } from '@/shared/lib/usePagination.ts';
import { searchSkills, type Skill, type SkillSearchResult, SkillCard } from '@/entities/skill/index.ts';
import { useSkills } from '@/features/skill-crud/index.ts';

export default function SkillsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const canWrite = useCanWrite('skills');
  const { skills, page, setPage, totalPages, loading, error, refresh } = useSkills(projectId ?? null, PAGE_SIZE);

  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [searchResults, setSearchResults] = useState<SkillSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('skill:')) refresh();
  }, [refresh]));

  const doSearch = useCallback(async (q: string) => {
    if (!projectId || !q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const results = await searchSkills(projectId, q.trim());
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

  const displaySkills = searchResults ?? skills;

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[{ label: 'Skills' }]}
        actions={
          canWrite ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('new')}>
              New Skill
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <TextField
          fullWidth
          size="small"
          placeholder="Semantic search skills..."
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

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading || searching ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : displaySkills.length === 0 ? (
        <EmptyState
          icon={<PsychologyIcon />}
          title={searchResults ? 'No matching skills found' : 'No skills yet'}
          description={searchResults ? 'Try a different search query' : 'Create your first skill to get started'}
          action={
            !searchResults && canWrite ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('new')}>
                New Skill
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Stack spacing={2}>
          {displaySkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill as Skill}
              score={'score' in skill ? (skill as unknown as SkillSearchResult).score : undefined}
              onClick={() => navigate(skill.id)}
              onEdit={canWrite ? () => navigate(`${skill.id}/edit`) : undefined}
            />
          ))}
        </Stack>
      )}

      {!searchResults && (
        <Box sx={{ mt: 2 }}>
          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} onRefresh={refresh} />
        </Box>
      )}
    </Box>
  );
}
