import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Card, CardActionArea, CardContent, Typography, TextField,
  InputAdornment, useTheme,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import SchoolIcon from '@mui/icons-material/School';
import ArticleIcon from '@mui/icons-material/Article';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { PageTopBar, FilterBar, StatusBadge } from '@/shared/ui/index.ts';
import { helpArticles, type HelpArticle } from '@/content/help/index.ts';

const CATEGORY_META: Record<string, { label: string; color: 'primary' | 'warning' | 'success'; icon: React.ReactNode }> = {
  overview: { label: 'Overview', color: 'primary', icon: <RocketLaunchIcon /> },
  concept: { label: 'Concept', color: 'warning', icon: <SchoolIcon /> },
  guide: { label: 'Guide', color: 'success', icon: <ArticleIcon /> },
};

function ArticleCard({ article, onClick }: { article: HelpArticle; onClick: () => void }) {
  const { palette } = useTheme();
  const meta = CATEGORY_META[article.category];

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea onClick={onClick} sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <StatusBadge label={meta.label} color={meta.color} />
            {article.relatedTools.length > 0 && (
              <Typography variant="caption" sx={{ color: palette.custom.textMuted, ml: 'auto' }}>
                {article.relatedTools.length} tool{article.relatedTools.length !== 1 ? 's' : ''}
              </Typography>
            )}
          </Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {article.title}
          </Typography>
          <Typography variant="body2" sx={{ color: palette.custom.textMuted, flex: 1 }}>
            {article.summary}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

export default function HelpPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return helpArticles;
    const q = search.toLowerCase();
    return helpArticles.filter(a =>
      a.title.toLowerCase().includes(q) ||
      a.summary.toLowerCase().includes(q) ||
      a.relatedTools.some(t => t.includes(q))
    );
  }, [search]);

  const grouped = useMemo(() => {
    const groups: Record<string, HelpArticle[]> = { overview: [], concept: [], guide: [] };
    for (const a of filtered) {
      (groups[a.category] ??= []).push(a);
    }
    return groups;
  }, [filtered]);

  return (
    <Box>
      <PageTopBar breadcrumbs={[{ label: 'Help' }]} />

      <FilterBar>
        <TextField
          size="small"
          placeholder="Search articles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 280 }}
        />
        <Typography variant="body2" sx={{ color: palette.custom.textMuted, ml: 'auto' }}>
          {filtered.length} article{filtered.length !== 1 ? 's' : ''}
        </Typography>
      </FilterBar>

      {filtered.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6 }}>
          <MenuBookIcon sx={{ fontSize: 48, color: palette.custom.textMuted, mb: 2 }} />
          <Typography variant="h6">No articles found</Typography>
          <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
            Try a different search term
          </Typography>
        </Box>
      ) : (
        Object.entries(grouped).map(([cat, articles]) => {
          if (articles.length === 0) return null;
          const meta = CATEGORY_META[cat];
          return (
            <Box key={cat} sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ color: palette.custom.textMuted, display: 'flex' }}>{meta.icon}</Box>
                <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {cat === 'overview' ? 'Getting Started' : cat === 'concept' ? 'Concepts' : 'Guides'}
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                {articles.map(a => (
                  <ArticleCard
                    key={a.id}
                    article={a}
                    onClick={() => navigate(`/${projectId}/help/${a.id}`)}
                  />
                ))}
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
