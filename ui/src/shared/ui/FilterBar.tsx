import { Box, Button, useTheme } from '@mui/material'
import type { ReactNode } from 'react'
import { FilterChip } from './FilterChip'

interface FilterBarProps {
  children: ReactNode
  actions?: ReactNode
  activeFilters?: Array<{
    key: string
    label: string
    color?: string
    onClear: () => void
  }>
  onClearAll?: () => void
}

export function FilterBar({ children, actions, activeFilters, onClearAll }: FilterBarProps) {
  const { palette } = useTheme()
  const hasChips = activeFilters && activeFilters.length > 0
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'wrap',
        px: 2,
        py: 1,
        bgcolor: palette.custom.surfaceMuted,
        borderRadius: 1,
        mb: 2,
      }}
    >
      <Box sx={{ display: 'flex', gap: 1.5, flex: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {children}
        {hasChips && activeFilters.map(f => (
          <FilterChip key={f.key} label={f.label} color={f.color} onDelete={f.onClear} />
        ))}
        {hasChips && onClearAll && (
          <Button size="small" onClick={onClearAll}>Clear all</Button>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
    </Box>
  )
}
