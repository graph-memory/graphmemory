import { FormControl, Select, MenuItem, Box, useTheme } from '@mui/material'
import type { ReactElement } from 'react'

export interface FilterOption {
  value: string
  label: string
  color?: string
  icon?: ReactElement
}

interface FilterControlProps {
  name: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  allLabel?: string
  options: FilterOption[]
  minWidth?: number
  visible?: boolean
}

export function FilterControl({
  name,
  value,
  onChange,
  placeholder,
  allLabel = 'All',
  options,
  minWidth = 120,
  visible = true,
}: FilterControlProps) {
  const { palette } = useTheme()

  if (!visible) return null

  return (
    <FormControl size="small" sx={{ minWidth }}>
      <Select
        name={name}
        value={value}
        onChange={e => onChange(e.target.value)}
        displayEmpty
        renderValue={v => {
          if (!v) return placeholder
          const opt = options.find(o => o.value === v)
          return opt?.label || v
        }}
        sx={{ color: value ? undefined : palette.custom.textMuted }}
      >
        <MenuItem value="">{allLabel}</MenuItem>
        {options.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {opt.color && (
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: opt.color }} />
              )}
              {opt.icon}
              {opt.label}
            </Box>
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
}
