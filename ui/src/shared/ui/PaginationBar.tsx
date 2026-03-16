import { Box, IconButton, Typography, useTheme } from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'

interface PaginationBarProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  onRefresh?: () => void
  showRefresh?: boolean
}

function pageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('...')
  for (let i = start; i <= end; i++) pages.push(i)
  if (end < total - 1) pages.push('...')
  pages.push(total)
  return pages
}

export function PaginationBar({ page, totalPages, onPageChange, onRefresh, showRefresh = true }: PaginationBarProps) {
  const { palette } = useTheme()
  if (totalPages <= 1 && !showRefresh) return null

  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5 }}>
      {showRefresh && onRefresh && (
        <IconButton size="small" onClick={onRefresh} sx={{ mr: 1 }}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      )}
      {totalPages > 1 && (
        <>
          <IconButton size="small" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            <ChevronLeftIcon fontSize="small" />
          </IconButton>
          {pageNumbers(page, totalPages).map((p, i) =>
            p === '...' ? (
              <Typography key={`e${i}`} variant="body2" sx={{ px: 0.5, color: palette.custom.textMuted }}>…</Typography>
            ) : (
              <IconButton
                key={p}
                size="small"
                onClick={() => onPageChange(p)}
                sx={{
                  minWidth: 28,
                  borderRadius: 1,
                  bgcolor: p === page ? palette.primary.main : 'transparent',
                  color: p === page ? palette.custom.textOnPrimary : 'inherit',
                  '&:hover': { bgcolor: p === page ? palette.primary.main : undefined },
                }}
              >
                <Typography variant="body2" fontSize="0.8125rem">{p}</Typography>
              </IconButton>
            )
          )}
          <IconButton size="small" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            <ChevronRightIcon fontSize="small" />
          </IconButton>
        </>
      )}
    </Box>
  )
}
