import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Chip, useTheme } from '@mui/material';
import BuildIcon from '@mui/icons-material/Build';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { PageTopBar, Section, StatusBadge, MarkdownRenderer, EmptyState } from '@/shared/ui/index.ts';
import { getArticle } from '@/content/help/index.ts';

const CATEGORY_COLORS: Record<string, 'primary' | 'warning' | 'success'> = {
  overview: 'primary',
  concept: 'warning',
  guide: 'success',
};

export default function HelpArticlePage() {
  const { projectId, articleId } = useParams();
  const navigate = useNavigate();
  const { palette } = useTheme();

  const article = articleId ? getArticle(articleId) : undefined;

  if (!article) {
    return (
      <Box>
        <PageTopBar breadcrumbs={[{ label: 'Help', to: `/${projectId}/help` }, { label: 'Not Found' }]} />
        <EmptyState icon={<MenuBookIcon />} title="Article not found" />
      </Box>
    );
  }

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Help', to: `/${projectId}/help` },
          { label: article.title },
        ]}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <StatusBadge
            label={article.category === 'overview' ? 'Overview' : article.category === 'concept' ? 'Concept' : 'Guide'}
            color={CATEGORY_COLORS[article.category] || 'primary'}
          />
          <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
            {article.summary}
          </Typography>
        </Box>

        {/* Article content */}
        <Section title="Article">
          <MarkdownRenderer>{article.content}</MarkdownRenderer>
        </Section>

        {/* Related tools */}
        {article.relatedTools.length > 0 && (
          <Section title="Related Tools">
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {article.relatedTools.map(toolName => (
                <Chip
                  key={toolName}
                  icon={<BuildIcon />}
                  label={toolName}
                  size="small"
                  variant="outlined"
                  clickable
                  onClick={() => navigate(`/${projectId}/tools/${toolName}`)}
                  sx={{ fontFamily: 'monospace' }}
                />
              ))}
            </Box>
          </Section>
        )}
      </Box>
    </Box>
  );
}
