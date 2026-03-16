import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, MenuItem, Select, FormControl, InputLabel, Typography, useTheme,
  InputAdornment, CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import BuildIcon from '@mui/icons-material/Build';
import { PageTopBar, FilterBar, StatusBadge, EmptyState } from '@/shared/ui/index.ts';
import { listTools, type ToolInfo } from '@/entities/tool/index.ts';

const CATEGORY_COLORS: Record<string, 'success' | 'error' | 'warning' | 'neutral' | 'primary'> = {
  docs: 'primary',
  code: 'success',
  knowledge: 'warning',
  tasks: 'neutral',
  files: 'neutral',
  'cross-graph': 'error',
};

export default function ToolsPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    listTools(projectId).then(setTools).finally(() => setLoading(false));
  }, [projectId]);

  const categories = useMemo(() => {
    const cats = new Set(tools.map(t => t.category));
    return ['all', ...Array.from(cats).sort()];
  }, [tools]);

  const filtered = useMemo(() => {
    return tools.filter(t => {
      if (category !== 'all' && t.category !== category) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
          !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tools, search, category]);

  const paramCount = (t: ToolInfo) => {
    const props = t.inputSchema?.properties;
    return props ? Object.keys(props).length : 0;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <PageTopBar breadcrumbs={[{ label: 'Tools' }]} />

      <FilterBar>
        <TextField
          size="small"
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={category}
            label="Category"
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map(c => (
              <MenuItem key={c} value={c}>{c === 'all' ? 'All' : c}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="body2" sx={{ color: palette.custom.textMuted, ml: 'auto' }}>
          {filtered.length} tool{filtered.length !== 1 ? 's' : ''}
        </Typography>
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<BuildIcon />}
          title="No tools found"
          description={search || category !== 'all' ? 'Try adjusting your filters' : 'No MCP tools available for this project'}
        />
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="center">Params</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((t) => (
                <TableRow
                  key={t.name}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/${projectId}/tools/${t.name}`)}
                >
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace' }}>
                      {t.name}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <StatusBadge label={t.category} color={CATEGORY_COLORS[t.category] || 'neutral'} />
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{
                        color: palette.custom.textMuted,
                        maxWidth: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.description}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body2">{paramCount(t)}</Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
