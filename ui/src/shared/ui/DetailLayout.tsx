import { Box } from '@mui/material'
import type { ReactNode } from 'react'

interface DetailLayoutProps {
  main: ReactNode
  sidebar: ReactNode
}

/**
 * Two-column layout for detail/view pages.
 * Main content (65%) on the left, sidebar metadata (35%) on the right.
 * Stacks vertically on small screens.
 */
export function DetailLayout({ main, sidebar }: DetailLayoutProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '65fr 35fr' },
        gap: 3,
        alignItems: 'start',
      }}
    >
      <Box>{main}</Box>
      <Box>{sidebar}</Box>
    </Box>
  )
}
