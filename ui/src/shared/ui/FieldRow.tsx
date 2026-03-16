import { Box, Typography, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

interface FieldRowProps {
  label: string
  children: ReactNode
  divider?: boolean
}

export function FieldRow({ label, children, divider = true }: FieldRowProps) {
  const { palette } = useTheme()
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        py: 1.25,
        borderBottom: divider ? `1px solid ${palette.custom.border}` : 'none',
      }}
    >
      <Typography
        variant="body2"
        sx={{ width: 200, flexShrink: 0, color: palette.custom.textMuted, pt: 0.25 }}
      >
        {label}
      </Typography>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}
