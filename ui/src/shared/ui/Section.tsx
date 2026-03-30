import { Box, Typography, useTheme, type SxProps } from '@mui/material'
import type { ReactNode } from 'react'

interface SectionProps {
  title: string
  action?: ReactNode
  children: ReactNode
  sx?: SxProps
}

export function Section({ title, action, children, sx }: SectionProps) {
  const { palette } = useTheme()
  return (
    <Box sx={{ borderRadius: 1, overflow: 'hidden', border: `1px solid ${palette.custom.border}`, display: 'flex', flexDirection: 'column', ...sx as object }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          bgcolor: palette.custom.surfaceMuted,
          flexShrink: 0,
        }}
      >
        <Typography variant="subtitle2" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title}
        </Typography>
        {action}
      </Box>
      <Box sx={{ p: 2, bgcolor: palette.custom.surface, flex: 1 }}>
        {children}
      </Box>
    </Box>
  )
}
