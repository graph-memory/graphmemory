import { Box, Typography, useTheme } from '@mui/material'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  const { palette } = useTheme()
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, px: 2 }}>
      {icon && (
        <Box sx={{ mb: 2, color: palette.custom.textMuted, '& .MuiSvgIcon-root': { fontSize: 48 } }}>
          {icon}
        </Box>
      )}
      <Typography variant="h6" gutterBottom>{title}</Typography>
      {description && (
        <Typography variant="body2" sx={{ color: palette.custom.textMuted, mb: 2, textAlign: 'center' }}>
          {description}
        </Typography>
      )}
      {action}
    </Box>
  )
}
