import { useState, useCallback } from 'react'
import { IconButton, useTheme } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'

interface CopyButtonProps {
  value: string
  size?: 'small' | 'medium'
}

export function CopyButton({ value, size = 'small' }: CopyButtonProps) {
  const { palette } = useTheme()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])

  return (
    <IconButton size={size} onClick={handleCopy} sx={{ color: palette.custom.textMuted }}>
      {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
    </IconButton>
  )
}
