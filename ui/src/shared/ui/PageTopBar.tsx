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
  // Single-item breadcrumb = root page whose title is already shown in the AppBar.
  // Skip the title but still render actions (if any).
  const isRootPage = breadcrumbs.length <= 1;

  if (isRootPage && !actions) return null;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isRootPage ? 'flex-end' : 'space-between', mb: isRootPage ? 1.5 : 3 }}>
      {!isRootPage && (
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
      )}
      {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
    </Box>
  )
}
