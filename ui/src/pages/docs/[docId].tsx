import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Alert, CircularProgress,
  Link, List, ListItemButton, ListItemText, useTheme,
} from '@mui/material';
import { getDocNode, getToc, type DocNode, type DocChunk } from '@/entities/doc/index.ts';
import { PageTopBar, Section, FieldRow, CopyButton, Tags } from '@/shared/ui/index.ts';

export default function DocDetailPage() {
  const { projectId, docId } = useParams<{ projectId: string; docId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [node, setNode] = useState<DocNode | null>(null);
  const [siblings, setSiblings] = useState<DocChunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !docId) return;
    setLoading(true);
    const nodeId = decodeURIComponent(docId);

    Promise.all([
      getDocNode(projectId, nodeId),
      getDocNode(projectId, nodeId).then(n =>
        getToc(projectId, n.fileId).catch(() => [])
      ),
    ])
      .then(([n, chunks]) => {
        setNode(n);
        setSiblings(chunks);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, docId]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  if (error || !node) {
    return <Alert severity="error">{error || 'Doc node not found'}</Alert>;
  }

  const nodeId = decodeURIComponent(docId!);

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Docs', to: `/${projectId}/docs` },
          { label: node.title || node.id },
        ]}
      />

      <Section title="Details" sx={{ mb: 3 }}>
        <FieldRow label="ID">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{node.id}</Typography>
            <CopyButton value={node.id} />
          </Box>
        </FieldRow>
        <FieldRow label="File">
          <Link component="button" variant="body2" onClick={() => navigate(`/${projectId}/docs`)}>
            {node.fileId}
          </Link>
        </FieldRow>
        <FieldRow label="Level">
          <Typography variant="body2">{node.level}</Typography>
        </FieldRow>
        {node.language && (
          <FieldRow label="Language">
            <Typography variant="body2">{node.language}</Typography>
          </FieldRow>
        )}
        {node.symbols && node.symbols.length > 0 && (
          <FieldRow label="Symbols" divider={false}>
            <Tags tags={node.symbols} />
          </FieldRow>
        )}
      </Section>

      {node.content && (
        <Section title="Content" sx={{ mb: 3 }}>
          <Typography
            variant="body2"
            sx={{
              whiteSpace: 'pre-wrap',
              fontFamily: node.language ? 'monospace' : 'inherit',
              fontSize: node.language ? '0.85rem' : undefined,
            }}
          >
            {node.content}
          </Typography>
        </Section>
      )}

      {siblings.length > 1 && (
        <Section title="In this file">
          <List dense disablePadding>
            {siblings.map(chunk => (
              <ListItemButton
                key={chunk.id}
                selected={chunk.id === nodeId}
                onClick={() => navigate(`/${projectId}/docs/${encodeURIComponent(chunk.id)}`)}
                sx={{
                  borderRadius: 1, py: 0.25,
                  ...(chunk.id === nodeId && {
                    bgcolor: `${palette.primary.main}14`,
                  }),
                }}
              >
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      sx={{ pl: (chunk.level - 1) * 2 }}
                      fontWeight={chunk.id === nodeId ? 700 : 400}
                    >
                      {chunk.title || chunk.id}
                    </Typography>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Section>
      )}
    </Box>
  );
}
