import { Box, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

interface FilterBarProps {
  children: ReactNode
  actions?: ReactNode
}

export function FilterBar({ children, actions }: FilterBarProps) {
  const { palette } = useTheme()
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 2,
        py: 1,
        bgcolor: palette.custom.surfaceMuted,
        borderRadius: 1,
        mb: 2,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, flex: 1, alignItems: 'center' }}>{children}</Box>
      {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
    </Box>
  )
}
