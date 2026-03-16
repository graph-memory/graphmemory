import { Box, Breadcrumbs, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import NavigateNextIcon from '@mui/icons-material/NavigateNext'
import type { ReactNode } from 'react'

interface BreadcrumbItem {
  label: string
  to?: string
}

interface PageTopBarProps {
  breadcrumbs: BreadcrumbItem[]
  actions?: ReactNode
}

export function PageTopBar({ breadcrumbs, actions }: PageTopBarProps) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />}>
        {breadcrumbs.map((item, i) =>
          item.to && i < breadcrumbs.length - 1 ? (
            <Link key={i} to={item.to} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Typography variant="body1" color="text.secondary">{item.label}</Typography>
            </Link>
          ) : (
            <Typography key={i} variant="body1" fontWeight={600}>{item.label}</Typography>
          )
        )}
      </Breadcrumbs>
      {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
    </Box>
  )
}
