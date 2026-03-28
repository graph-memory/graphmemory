import { useState } from 'react';
import { Box, Typography, Card, CardContent, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, useTheme } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { Tags, StatusBadge } from '@/shared/ui/index.ts';
import type { Note } from './api.ts';

interface NoteCardProps {
  note: Note;
  score?: number;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function NoteCard({ note, score, onClick, onEdit, onDelete }: NoteCardProps) {
  const { palette } = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const hasMenu = !!onEdit || !!onDelete;

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
              <Typography
                variant="body2"
                sx={{
                  color: palette.custom.textMuted,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {note.content.replace(/^#+\s*/gm, '').replace(/[*_`]/g, '').trim()}
              </Typography>
            )}
            {note.tags?.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Tags tags={note.tags} />
              </Box>
            )}
          </Box>
          {hasMenu && (
            <>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setMenuAnchor(e.currentTarget); }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
              <Menu
                anchorEl={menuAnchor}
                open={!!menuAnchor}
                onClose={(e: React.SyntheticEvent) => { e.stopPropagation?.(); setMenuAnchor(null); }}
                onClick={(e) => e.stopPropagation()}
              >
                {onEdit && (
                  <MenuItem onClick={() => { setMenuAnchor(null); onEdit(); }}>
                    <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
                    <ListItemText>Edit</ListItemText>
                  </MenuItem>
                )}
                {onDelete && (
                  <MenuItem onClick={() => { setMenuAnchor(null); onDelete(); }} sx={{ color: 'error.main' }}>
                    <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon>
                    <ListItemText>Delete</ListItemText>
                  </MenuItem>
                )}
              </Menu>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
