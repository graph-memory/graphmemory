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
        py: 0.75,
        borderBottom: divider ? `1px solid ${palette.custom.border}` : 'none',
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: palette.custom.textMuted, lineHeight: 1.2 }}
      >
        {label}
      </Typography>
      <Box sx={{ mt: 0.25, minWidth: 0 }}>{children}</Box>
    </Box>
  )
}
