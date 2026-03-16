import { useState, type KeyboardEvent } from 'react'
import { Box, Chip, TextField, useTheme } from '@mui/material'

interface TagsProps {
  tags: string[]
  onAdd?: (tag: string) => void
  onRemove?: (tag: string) => void
  editable?: boolean
}

export function Tags({ tags, onAdd, onRemove, editable = false }: TagsProps) {
  const { palette } = useTheme()
  const [input, setInput] = useState('')

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && input.trim()) {
      e.preventDefault()
      onAdd?.(input.trim())
      setInput('')
    }
  }

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
      {tags.map(tag => (
        <Chip
          key={tag}
          label={tag}
          size="small"
          onDelete={editable ? () => onRemove?.(tag) : undefined}
          sx={{
            bgcolor: palette.custom.surfaceMuted,
            border: `1px solid ${palette.custom.border}`,
            color: palette.custom.textMuted,
          }}
        />
      ))}
      {editable && (
        <TextField
          size="small"
          placeholder="Add tag…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          sx={{ width: 100, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.8125rem' } }}
        />
      )}
    </Box>
  )
}
