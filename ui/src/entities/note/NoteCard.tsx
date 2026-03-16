import { Box, Typography, Card, CardContent, IconButton, Tooltip, useTheme } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { Tags, StatusBadge } from '@/shared/ui/index.ts';
import type { Note } from './api.ts';

interface NoteCardProps {
  note: Note;
  score?: number;
  onClick?: () => void;
  onEdit?: () => void;
}

export function NoteCard({ note, score, onClick, onEdit }: NoteCardProps) {
  const { palette } = useTheme();
  return (
    <Card
      variant="outlined"
      sx={{
        cursor: onClick ? 'pointer' : 'default',
        '&:hover': onClick ? { borderColor: 'primary.main' } : {},
      }}
      onClick={onClick}
    >
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
              <Typography variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1 }}>
                {note.title}
              </Typography>
              {score !== undefined && (
                <StatusBadge label={`${(score * 100).toFixed(0)}%`} color="primary" size="small" />
              )}
            </Box>
            {note.content && (
              <Typography variant="body2" sx={{ color: palette.custom.textMuted }} noWrap>
                {note.content}
              </Typography>
            )}
            {note.tags?.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Tags tags={note.tags} />
              </Box>
            )}
          </Box>
          {onEdit && (
            <Tooltip title="Edit">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
