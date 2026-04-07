import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Alert, CircularProgress, Chip,
  Link, List, ListItemButton, ListItemText, ListItemIcon, useTheme,
} from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  getSymbol, getFileSymbols, getSymbolEdges,
  type CodeSymbol, type CodeEdge,
} from '@/entities/code/index.ts';
import { PageTopBar, Section, FieldRow, CopyButton, DetailLayout } from '@/shared/ui/index.ts';
import { useProjectDir } from '@/shared/lib/useProjectDir.ts';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

type ChipColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'default';

const KIND_COLORS = {
  function: 'primary', class: 'warning', method: 'info', constructor: 'info',
  interface: 'secondary', type: 'secondary', enum: 'success', variable: 'success', file: 'error',
} as const;

function kindColor(kind: string): ChipColor {
  return (KIND_COLORS as Record<string, ChipColor>)[kind] ?? 'default';
}

export default function CodeDetailPage() {
  const { projectId, symbolId } = useParams<{ projectId: string; symbolId: string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [symbol, setSymbol] = useState<CodeSymbol | null>(null);
  const [siblings, setSiblings] = useState<CodeSymbol[]>([]);
  const [edges, setEdges] = useState<CodeEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projectDir = useProjectDir(projectId);

  useEffect(() => {
    if (!projectId || !symbolId) return;
    setLoading(true);
    const nodeId = decodeURIComponent(symbolId);

    Promise.all([
      getSymbol(projectId, nodeId),
      getSymbolEdges(projectId, nodeId).catch(() => []),
    ])
      .then(([sym, e]) => {
        setSymbol(sym);
        setEdges(e);
        setError(null);
        return getFileSymbols(projectId, sym.fileId).catch(() => []);
      })
      .then(sibs => setSiblings(sibs))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, symbolId]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  if (error || !symbol) {
    return <Alert severity="error">{error || 'Symbol not found'}</Alert>;
  }

  const nodeId = decodeURIComponent(symbolId!);
  const outEdges = edges.filter(e => e.source === nodeId);
  const inEdges = edges.filter(e => e.target === nodeId);

  const main = (
    <>
      {symbol.signature && (
        <Section title="Signature" sx={{ mb: 3 }}>
          <Typography
            variant="body2"
            sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '0.85rem' }}
          >
            {symbol.signature}
          </Typography>
        </Section>
      )}

      {symbol.body && (
        <Section title="Source" sx={{ mb: 3 }}>
          <Typography
            variant="body2"
            component="pre"
            sx={{
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              maxHeight: 400,
              overflow: 'auto',
              p: 1.5,
              bgcolor: palette.mode === 'dark' ? 'grey.900' : 'grey.50',
              borderRadius: 1,
            }}
          >
            {symbol.body}
          </Typography>
        </Section>
      )}

      {(outEdges.length > 0 || inEdges.length > 0 || (symbol.crossLinks && symbol.crossLinks.length > 0)) && (
        <Section title="Relations" sx={{ mb: 3 }}>
          <List dense disablePadding>
            {outEdges.map((edge, i) => (
              <ListItemButton
                key={`out-${i}`}
                onClick={() => navigate(`/${projectId}/code/${encodeURIComponent(edge.target)}`)}
                sx={{ borderRadius: 1, py: 0.25 }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <ArrowForwardIcon fontSize="small" color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={edge.kind} size="small" variant="outlined" />
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{edge.target}</Typography>
                    </Box>
                  }
                />
              </ListItemButton>
            ))}
            {inEdges.map((edge, i) => (
              <ListItemButton
                key={`in-${i}`}
                onClick={() => navigate(`/${projectId}/code/${encodeURIComponent(edge.source)}`)}
                sx={{ borderRadius: 1, py: 0.25 }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <ArrowBackIcon fontSize="small" color="secondary" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={edge.kind} size="small" variant="outlined" />
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{edge.source}</Typography>
                    </Box>
                  }
                />
              </ListItemButton>
            ))}
            {symbol.crossLinks?.map((link, i) => (
              <ListItemButton
                key={`cross-${i}`}
                sx={{ borderRadius: 1, py: 0.25 }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <ArrowBackIcon fontSize="small" color="warning" />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip label={`${link.graph}:${link.edgeKind}`} size="small" variant="outlined" color="warning" />
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{link.nodeId}</Typography>
                    </Box>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Section>
      )}
    </>
  );

  const sidebar = (
    <>
      <Section title="Details" sx={{ mb: 3 }}>
        <FieldRow label="ID">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{symbol.id}</Typography>
            <CopyButton value={symbol.id} />
          </Box>
        </FieldRow>
        <FieldRow label="File">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Link component="button" variant="body2" onClick={() => navigate(`/${projectId}/files/view/${symbol.fileId}`)}>
              {symbol.fileId}
            </Link>
            {projectDir && (
              <Link
                href={`vscode://file/${projectDir}/${symbol.fileId}:${symbol.startLine}`}
                sx={{ display: 'inline-flex', color: palette.custom.textMuted }}
                title="Open in VS Code"
              >
                <OpenInNewIcon sx={{ fontSize: 14 }} />
              </Link>
            )}
          </Box>
        </FieldRow>
        <FieldRow label="Kind">
          <Chip label={symbol.kind} size="small" color={kindColor(symbol.kind)} variant="outlined" />
        </FieldRow>
        <FieldRow label="Lines">
          <Typography variant="body2">{symbol.startLine}–{symbol.endLine}</Typography>
        </FieldRow>
        {symbol.isExported && (
          <FieldRow label="Exported">
            <Chip label="yes" size="small" variant="outlined" />
          </FieldRow>
        )}
        {symbol.docComment && (
          <FieldRow label="Doc" divider={false}>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: palette.custom.textMuted }}>
              {symbol.docComment}
            </Typography>
          </FieldRow>
        )}
      </Section>

      {siblings.filter(s => s.kind !== 'file').length > 1 && (
        <Section title="In this file">
          <List dense disablePadding>
            {siblings.filter(s => s.kind !== 'file').map((sym, i) => (
              <ListItemButton
                key={`${sym.id}-${i}`}
                selected={sym.id === nodeId}
                onClick={() => navigate(`/${projectId}/code/${encodeURIComponent(sym.id)}`)}
                sx={{
                  borderRadius: 1, py: 0.25,
                  ...(sym.id === nodeId && {
                    bgcolor: `${palette.primary.main}14`,
                  }),
                }}
              >
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <CodeIcon fontSize="small" sx={{ opacity: 0.5 }} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        variant="body2"
                        fontWeight={sym.id === nodeId ? 700 : 400}
                      >
                        {sym.name}
                      </Typography>
                      <Chip label={sym.kind} size="small" variant="outlined" color={kindColor(sym.kind)} />
                    </Box>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        </Section>
      )}
    </>
  );

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Code', to: `/${projectId}/code` },
          { label: symbol.name || symbol.id },
        ]}
      />

      <DetailLayout main={main} sidebar={sidebar} />
    </Box>
  );
}
