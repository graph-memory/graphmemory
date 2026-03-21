import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, useTheme, CircularProgress,
  Switch, Chip, Alert,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BuildIcon from '@mui/icons-material/Build';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import { PageTopBar, Section, StatusBadge, CopyButton, EmptyState, FieldLabel } from '@/shared/ui/index.ts';
import { getTool, callTool, type ToolInfo, type ToolCallResult, type JsonSchemaProperty } from '@/entities/tool/index.ts';
import { getArticlesForTool } from '@/content/help/index.ts';

const CATEGORY_COLORS: Record<string, 'success' | 'error' | 'warning' | 'neutral' | 'primary'> = {
  docs: 'primary',
  code: 'success',
  knowledge: 'warning',
  tasks: 'neutral',
  skills: 'primary',
  files: 'neutral',
  context: 'neutral',
  'cross-graph': 'error',
};

function buildDefaultArgs(tool: ToolInfo): Record<string, string> {
  const args: Record<string, string> = {};
  const props = tool.inputSchema?.properties || {};
  for (const [key, prop] of Object.entries(props)) {
    if (prop.default !== undefined) {
      args[key] = String(prop.default);
    } else {
      args[key] = '';
    }
  }
  return args;
}

function parseArgValue(raw: string, prop: JsonSchemaProperty): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;

  if (prop.type === 'number' || prop.type === 'integer') {
    const n = Number(trimmed);
    return isNaN(n) ? undefined : n;
  }
  if (prop.type === 'boolean') {
    return trimmed === 'true';
  }
  if (prop.type === 'array') {
    try { return JSON.parse(trimmed); }
    catch { return trimmed.split(',').map(s => s.trim()).filter(Boolean); }
  }
  if (prop.type === 'object') {
    try { return JSON.parse(trimmed); }
    catch { return undefined; }
  }
  return trimmed;
}

function formatType(prop: JsonSchemaProperty): string {
  if (prop.enum) return prop.enum.join(' | ');
  if (prop.type === 'array' && prop.items?.type) return `${prop.items.type}[]`;
  return prop.type || 'any';
}

export default function ToolDetailPage() {
  const { projectId, toolName } = useParams();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [tool, setTool] = useState<ToolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ToolCallResult | null>(null);

  useEffect(() => {
    if (!projectId || !toolName) return;
    setLoading(true);
    getTool(projectId, toolName).then(t => {
      setTool(t);
      setArgs(buildDefaultArgs(t));
    }).finally(() => setLoading(false));
  }, [projectId, toolName]);

  const handleExecute = useCallback(async () => {
    if (!projectId || !toolName || !tool) return;
    setExecuting(true);
    setResult(null);
    try {
      const props = tool.inputSchema?.properties || {};
      const parsed: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(args)) {
        const val = parseArgValue(raw, props[key] || {});
        if (val !== undefined) parsed[key] = val;
      }
      const res = await callTool(projectId, toolName, parsed);
      setResult(res);
    } catch (err: unknown) {
      setResult({
        result: [{ type: 'text', text: err instanceof Error ? err.message : 'Unknown error' }],
        isError: true,
        duration: 0,
      });
    } finally {
      setExecuting(false);
    }
  }, [projectId, toolName, tool, args]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!tool) {
    return <EmptyState icon={<BuildIcon />} title="Tool not found" />;
  }

  const properties = tool.inputSchema?.properties || {};
  const required = new Set(tool.inputSchema?.required || []);

  const resultText = result
    ? result.result.map(c => c.text || '').join('\n')
    : '';

  let prettyResult = resultText;
  try {
    prettyResult = JSON.stringify(JSON.parse(resultText), null, 2);
  } catch { /* not JSON, use raw */ }

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Tools', to: `/${projectId}/tools` },
          { label: tool.name },
        ]}
      />

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {/* Info */}
        <Section title="Info">
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography variant="h6" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                {tool.name}
              </Typography>
              <StatusBadge label={tool.category} color={CATEGORY_COLORS[tool.category] || 'neutral'} />
              <CopyButton value={tool.name} />
            </Box>
            <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
              {tool.description}
            </Typography>
          </Box>
        </Section>

        {/* Parameters table */}
        <Section title={`Parameters (${Object.keys(properties).length})`}>
          {Object.keys(properties).length === 0 ? (
            <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
              This tool takes no parameters.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Required</TableCell>
                    <TableCell>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {Object.entries(properties).map(([name, prop]) => (
                    <TableRow key={name}>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                          {name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={formatType(prop)} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {required.has(name) ? (
                          <Typography variant="body2" color="error" fontWeight={600}>Yes</Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>No</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
                          {prop.description || '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Section>

        {/* Playground */}
        <Section
          title="Playground"
          action={
            <Button
              variant="contained"
              size="small"
              startIcon={executing ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              onClick={handleExecute}
              disabled={executing}
            >
              {executing ? 'Running...' : 'Execute'}
            </Button>
          }
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {Object.keys(properties).length === 0 ? (
              <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
                No parameters required. Click Execute to run.
              </Typography>
            ) : (
              Object.entries(properties).map(([name, prop]) => {
                if (prop.type === 'boolean') {
                  return (
                    <Box key={name}>
                      <FieldLabel>{name}</FieldLabel>
                      <Switch
                        checked={args[name] === 'true'}
                        onChange={(e) => setArgs(prev => ({ ...prev, [name]: String(e.target.checked) }))}
                        size="small"
                      />
                    </Box>
                  );
                }

                const isMultiline = prop.type === 'array' || prop.type === 'object' ||
                  (name === 'content' || name === 'description');

                return (
                  <Box key={name}>
                    <FieldLabel required={required.has(name)}>{name}</FieldLabel>
                    <TextField
                      value={args[name] || ''}
                      onChange={(e) => setArgs(prev => ({ ...prev, [name]: e.target.value }))}
                      size="small"
                      fullWidth
                      multiline={isMultiline}
                      minRows={isMultiline ? 2 : undefined}
                      helperText={prop.description}
                      placeholder={
                        prop.enum ? prop.enum.join(' | ') :
                        prop.type === 'array' ? '["item1", "item2"] or item1, item2' :
                        prop.type === 'number' || prop.type === 'integer' ? '0' :
                        undefined
                      }
                      slotProps={{
                        input: { sx: { fontFamily: 'monospace', fontSize: '0.875rem' } },
                      }}
                    />
                  </Box>
                );
              })
            )}
          </Box>
        </Section>

        {/* Response */}
        {result && (
          <Section
            title="Response"
            action={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="caption" sx={{ color: palette.custom.textMuted }}>
                  {result.duration}ms
                </Typography>
                {resultText && <CopyButton value={prettyResult} />}
              </Box>
            }
          >
            {result.isError && (
              <Alert severity="error" sx={{ mb: 1.5 }}>Tool returned an error</Alert>
            )}
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1.5,
                bgcolor: palette.custom.surfaceMuted,
                borderRadius: 1,
                overflow: 'auto',
                maxHeight: 500,
                fontFamily: 'monospace',
                fontSize: '0.8125rem',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {prettyResult || '(empty response)'}
            </Box>
          </Section>
        )}
        {/* Related help articles */}
        {toolName && getArticlesForTool(toolName).length > 0 && (
          <Section title="Related Guides">
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {getArticlesForTool(toolName).map(article => (
                <Chip
                  key={article.id}
                  icon={<MenuBookIcon />}
                  label={article.title}
                  size="small"
                  variant="outlined"
                  clickable
                  onClick={() => navigate(`/${projectId}/help/${article.id}`)}
                />
              ))}
            </Box>
          </Section>
        )}
      </Box>
    </Box>
  );
}
