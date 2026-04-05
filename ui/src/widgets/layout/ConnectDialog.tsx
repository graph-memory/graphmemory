import { useMemo, useEffect } from 'react'
import {
  Dialog, DialogTitle, DialogContent, IconButton,
  Typography, Box, useTheme, Tabs, Tab,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import TerminalIcon from '@mui/icons-material/Terminal'
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile'
import { useState, useCallback } from 'react'
import { checkAuthStatus } from '@/entities/project/api.ts'
import { request } from '@/shared/api/client.ts'

interface ConnectDialogProps {
  open: boolean
  onClose: () => void
  projectId: string
}

function CopyBlock({ value }: { value: string }) {
  const { palette } = useTheme()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])

  return (
    <Box sx={{ position: 'relative' }}>
      <Box
        sx={{
          bgcolor: palette.mode === 'dark' ? '#1a1a1a' : '#f5f5f5',
          border: `1px solid ${palette.custom.border}`,
          borderRadius: 1,
          p: 1.5,
          pr: 5,
          fontFamily: 'monospace',
          fontSize: '0.8125rem',
          lineHeight: 1.6,
          whiteSpace: 'pre',
          overflow: 'auto',
        }}
      >
        {value}
      </Box>
      <IconButton
        size="small"
        onClick={handleCopy}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          color: copied ? 'success.main' : palette.custom.textMuted,
        }}
      >
        {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
      </IconButton>
    </Box>
  )
}

function buildMcpJson(url: string, apiKey: string): string {
  const server: Record<string, unknown> = { type: 'http', url }
  if (apiKey) {
    server.headers = { Authorization: `Bearer ${apiKey}` }
  }
  return JSON.stringify({ mcpServers: { 'graph-memory': server } }, null, 2)
}

const TAB_LABELS = ['.mcp.json', 'Claude CLI', 'Cursor', 'Windsurf']
const TAB_ICONS = [
  <InsertDriveFileIcon sx={{ fontSize: 16 }} />,
  <TerminalIcon sx={{ fontSize: 16 }} />,
  <InsertDriveFileIcon sx={{ fontSize: 16 }} />,
  <InsertDriveFileIcon sx={{ fontSize: 16 }} />,
]

const TAB_DESCRIPTIONS: Record<number, { text: string; path?: string }> = {
  0: {
    text: 'Add to your project\u2019s .mcp.json file (or create one in the project root). Works with Claude Desktop and other MCP-compatible clients.',
  },
  1: {
    text: 'Run this command in your terminal to register the MCP server with Claude Code CLI.',
  },
  2: {
    text: 'Add to your Cursor MCP configuration file.',
    path: '~/.cursor/mcp.json',
  },
  3: {
    text: 'Add to your Windsurf MCP configuration file.',
    path: '~/.codeium/windsurf/mcp_config.json',
  },
}

export function ConnectDialog({ open, onClose, projectId }: ConnectDialogProps) {
  const { palette } = useTheme()
  const [tab, setTab] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [authRequired, setAuthRequired] = useState(false)

  useEffect(() => {
    if (!open) return
    checkAuthStatus()
      .then(data => {
        setAuthRequired(data.required === true)
        if (data.authenticated) {
          request<{ apiKey: string | null }>('/auth/apikey')
            .then(d => { if (d?.apiKey) setApiKey(d.apiKey) })
            .catch(e => console.error('Failed to fetch API key', e))
        }
      })
      .catch(() => setAuthRequired(false))
  }, [open])

  const baseUrl = useMemo(() => {
    const { protocol, hostname, port } = window.location
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`
  }, [])

  const mcpUrl = `${baseUrl}/mcp/${projectId}`

  const mcpJson = buildMcpJson(mcpUrl, apiKey)

  const claudeCliCommand = apiKey
    ? `claude mcp add --transport http --scope project \\\n  --header "Authorization: Bearer ${apiKey}" \\\n  graph-memory ${mcpUrl}`
    : `claude mcp add --transport http --scope project graph-memory ${mcpUrl}`

  const desc = TAB_DESCRIPTIONS[tab]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: palette.mode === 'dark' ? '#252526' : undefined,
          border: palette.mode === 'dark' ? '1px solid #454545' : undefined,
        },
      }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
        <Typography variant="h6" fontWeight={700}>Connect MCP</Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: palette.custom.textMuted }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 0 }}>
        <Typography variant="body2" sx={{ color: palette.custom.textMuted, mb: 2 }}>
          Connect your AI assistant to <strong>{projectId}</strong> via MCP (Model Context Protocol).
        </Typography>

        {authRequired && apiKey && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ color: palette.custom.textMuted, mb: 0.5, display: 'block' }}>
              API Key
            </Typography>
            <CopyBlock value={apiKey} />
          </Box>
        )}

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}
        >
          {TAB_LABELS.map((label, i) => (
            <Tab key={label} icon={TAB_ICONS[i]} iconPosition="start" label={label} />
          ))}
        </Tabs>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
            {desc.text}
          </Typography>
          {desc.path && (
            <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>
              Config path: <code>{desc.path}</code>
            </Typography>
          )}
          <CopyBlock value={tab === 1 ? claudeCliCommand : mcpJson} />
        </Box>

        <Box sx={{ mt: 3, pt: 2, borderTop: `1px solid ${palette.custom.border}` }}>
          <Typography variant="caption" sx={{ color: palette.custom.textMuted, mb: 0.5, display: 'block' }}>
            Endpoint
          </Typography>
          <CopyBlock value={mcpUrl} />
        </Box>
      </DialogContent>
    </Dialog>
  )
}
