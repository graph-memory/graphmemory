import { Chip, Box } from '@mui/material'

interface FilterChipProps {
  label: string
  onDelete: () => void
  color?: string
}

export function FilterChip({ label, onDelete, color }: FilterChipProps) {
  return (
    <Chip
      size="small"
      label={
        color ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
            {label}
          </Box>
        ) : label
      }
      onDelete={onDelete}
      sx={{ height: 24, '& .MuiChip-label': { px: 1 } }}
    />
  )
}
