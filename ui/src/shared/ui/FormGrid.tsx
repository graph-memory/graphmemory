import { Box } from '@mui/material'
import type { ReactNode } from 'react'

interface FormGridProps {
  children: ReactNode
}

export function FormGrid({ children }: FormGridProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 2,
      }}
    >
      {children}
    </Box>
  )
}

interface FormFieldProps {
  children: ReactNode
  fullWidth?: boolean
}

export function FormField({ children, fullWidth = false }: FormFieldProps) {
  return (
    <Box sx={fullWidth ? { gridColumn: '1 / -1' } : undefined}>
      {children}
    </Box>
  )
}
