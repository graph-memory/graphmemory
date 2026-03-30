import { Box } from '@mui/material'
import type { ReactNode } from 'react'
import { FieldLabel } from './FieldLabel.tsx'

interface FieldRowProps {
  label: string
  children: ReactNode
  divider?: boolean
}

export function FieldRow({ label, children, divider: _divider }: FieldRowProps) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <FieldLabel>{label}</FieldLabel>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
    </Box>
  )
}
