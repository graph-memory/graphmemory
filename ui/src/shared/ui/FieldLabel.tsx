import { Typography, type SxProps } from '@mui/material'
import type { ReactNode } from 'react'

interface FieldLabelProps {
  children: ReactNode
  required?: boolean
  sx?: SxProps
}

export function FieldLabel({ children, required, sx }: FieldLabelProps) {
  return (
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        mb: 0.25,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'text.secondary',
        ...sx as object,
      }}
    >
      {children}{required && ' *'}
    </Typography>
  )
}
