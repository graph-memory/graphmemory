import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Typography, Box, useTheme, Link as MuiLink } from '@mui/material';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  children: string;
}

export function MarkdownRenderer({ children }: MarkdownRendererProps) {
  const { palette } = useTheme();

  const components: Components = {
    h1: ({ children }) => (
      <Typography variant="h5" fontWeight={700} gutterBottom sx={{ mt: 3, mb: 1.5 }}>
        {children}
      </Typography>
    ),
    h2: ({ children }) => (
      <Typography variant="h6" fontWeight={700} gutterBottom sx={{ mt: 3, mb: 1 }}>
        {children}
      </Typography>
    ),
    h3: ({ children }) => (
      <Typography variant="subtitle1" fontWeight={700} gutterBottom sx={{ mt: 2, mb: 0.5 }}>
        {children}
      </Typography>
    ),
    p: ({ children }) => (
      <Typography variant="body2" sx={{ mb: 1.5, lineHeight: 1.7 }}>
        {children}
      </Typography>
    ),
    a: ({ href, children }) => (
      <MuiLink href={href} underline="hover" color="primary">
        {children}
      </MuiLink>
    ),
    ul: ({ children }) => (
      <Box component="ul" sx={{ pl: 3, mb: 1.5, '& li': { mb: 0.5 } }}>
        {children}
      </Box>
    ),
    ol: ({ children }) => (
      <Box component="ol" sx={{ pl: 3, mb: 1.5, '& li': { mb: 0.5 } }}>
        {children}
      </Box>
    ),
    li: ({ children }) => (
      <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
        {children}
      </Typography>
    ),
    code: ({ className, children }) => {
      const isBlock = className?.startsWith('language-');
      if (isBlock) {
        return (
          <Box
            component="pre"
            sx={{
              p: 2,
              mb: 1.5,
              bgcolor: palette.custom.surfaceMuted,
              borderRadius: 1,
              border: `1px solid ${palette.custom.border}`,
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.8125rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            <code>{children}</code>
          </Box>
        );
      }
      return (
        <Box
          component="code"
          sx={{
            px: 0.6,
            py: 0.15,
            bgcolor: palette.custom.surfaceMuted,
            borderRadius: 0.5,
            fontFamily: 'monospace',
            fontSize: '0.8125rem',
          }}
        >
          {children}
        </Box>
      );
    },
    pre: ({ children }) => <>{children}</>,
    blockquote: ({ children }) => (
      <Box
        sx={{
          pl: 2,
          ml: 0,
          borderLeft: `3px solid ${palette.primary.main}`,
          color: palette.custom.textMuted,
          mb: 1.5,
        }}
      >
        {children}
      </Box>
    ),
    table: ({ children }) => (
      <Box
        component="table"
        sx={{
          width: '100%',
          mb: 1.5,
          borderCollapse: 'collapse',
          '& th, & td': {
            border: `1px solid ${palette.custom.border}`,
            px: 1.5,
            py: 0.75,
            fontSize: '0.8125rem',
            textAlign: 'left',
          },
          '& th': {
            bgcolor: palette.custom.surfaceMuted,
            fontWeight: 600,
          },
        }}
      >
        {children}
      </Box>
    ),
    hr: () => (
      <Box
        component="hr"
        sx={{ border: 'none', borderTop: `1px solid ${palette.custom.border}`, my: 2 }}
      />
    ),
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
