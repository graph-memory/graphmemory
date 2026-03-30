import { useState } from 'react';
import { Box, Typography, Card, CardContent, IconButton, Menu, MenuItem, ListItemIcon, ListItemText, useTheme } from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { Tags, StatusBadge } from '@/shared/ui/index.ts';
import { SOURCE_BADGE_COLOR, sourceLabel, confidenceLabel } from './config.ts';
import type { Skill } from './api.ts';

interface SkillCardProps {
  skill: Skill;
  score?: number;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function SkillCard({ skill, score, onClick, onEdit, onDelete }: SkillCardProps) {
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
                {skill.title}
              </Typography>
              <StatusBadge label={sourceLabel(skill.source)} color={SOURCE_BADGE_COLOR[skill.source] ?? 'primary'} size="small" />
              <StatusBadge label={confidenceLabel(skill.confidence)} color="neutral" size="small" />
              {score !== undefined && (
                <StatusBadge label={`${(score * 100).toFixed(0)}%`} color="primary" size="small" />
              )}
            </Box>
            {skill.description && (
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
                {skill.description.replace(/^#+\s*/gm, '').replace(/[*_`]/g, '').trim()}
              </Typography>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              {skill.usageCount > 0 && (
                <Typography variant="caption" sx={{ color: palette.custom.textMuted }}>
                  Used {skill.usageCount} time{skill.usageCount !== 1 ? 's' : ''}
                </Typography>
              )}
              {skill.tags?.length > 0 && (
                <Tags tags={skill.tags} />
              )}
            </Box>
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
