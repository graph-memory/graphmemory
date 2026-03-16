import { Typography, useTheme } from '@mui/material'

interface DateDisplayProps {
  value: string | number | Date
  showTime?: boolean
  showRelative?: boolean
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const RELATIVE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000

function formatDate(d: Date, showTime: boolean): string {
  const day = String(d.getDate()).padStart(2, '0')
  const mon = MONTHS[d.getMonth()]
  const year = d.getFullYear()
  if (!showTime) return `${day} ${mon} ${year}`
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${mon} ${year}, ${h}:${m}`
}

function relativeTime(d: Date): string | null {
  const diff = Date.now() - d.getTime()
  if (diff < 0 || diff > RELATIVE_THRESHOLD_MS) return null
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function DateDisplay({ value, showTime = false, showRelative = true }: DateDisplayProps) {
  const { palette } = useTheme()
  const d = value instanceof Date ? value : new Date(value)
  if (isNaN(d.getTime())) return null

  const abs = formatDate(d, showTime)
  const rel = showRelative ? relativeTime(d) : null

  return (
    <Typography component="span" variant="body2">
      {abs}
      {rel && (
        <Typography component="span" variant="body2" sx={{ color: palette.custom.textMuted, ml: 0.5 }}>
          · {rel}
        </Typography>
      )}
    </Typography>
  )
}
