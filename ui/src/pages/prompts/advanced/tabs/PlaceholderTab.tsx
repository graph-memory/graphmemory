import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ConstructionIcon from '@mui/icons-material/Construction';

interface PlaceholderTabProps {
  title: string;
  description: string;
}

export default function PlaceholderTab({ title, description }: PlaceholderTabProps) {
  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 1, py: 6, px: 2,
    }}>
      <ConstructionIcon sx={{ fontSize: 32, color: 'text.secondary', opacity: 0.3 }} />
      <Typography variant="subtitle2" color="text.secondary">{title}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 280 }}>
        {description}
      </Typography>
    </Box>
  );
}
