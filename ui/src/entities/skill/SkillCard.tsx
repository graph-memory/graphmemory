import { Box, Typography, Card, CardContent, IconButton, Tooltip, useTheme } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { Tags, StatusBadge } from '@/shared/ui/index.ts';
import { SOURCE_BADGE_COLOR, sourceLabel, confidenceLabel } from './config.ts';
import type { Skill } from './api.ts';

interface SkillCardProps {
  skill: Skill;
  score?: number;
  onClick?: () => void;
  onEdit?: () => void;
}

export function SkillCard({ skill, score, onClick, onEdit }: SkillCardProps) {
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
