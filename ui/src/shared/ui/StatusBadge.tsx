import { Chip, useTheme } from '@mui/material'
import type { ReactElement } from 'react'

interface StatusBadgeProps {
  label: string
  color: 'success' | 'error' | 'warning' | 'neutral' | 'primary'
  icon?: ReactElement
  size?: 'small' | 'medium'
}

export function StatusBadge({ label, color, icon, size = 'small' }: StatusBadgeProps) {
  const { palette } = useTheme()

  const colorMap: Record<string, string> = {
    success: palette.success.main,
    error: palette.error.main,
    warning: palette.warning.main,
    neutral: palette.custom.neutral,
    primary: palette.primary.main,
  }

  const fg = colorMap[color] ?? palette.custom.neutral

  return (
    <Chip
      label={label}
      icon={icon}
      size={size}
      sx={{
        bgcolor: `${fg}26`,
        color: fg,
        border: 'none',
        borderRadius: '999px',
        fontWeight: 600,
        '& .MuiChip-icon': { color: fg },
      }}
    />
  )
}
