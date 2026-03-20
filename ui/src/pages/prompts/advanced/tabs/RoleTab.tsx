import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { type RoleName } from '@/content/prompts/index.ts';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import SectionToggle from './SectionToggle.tsx';

const ROLE_OPTIONS: { value: RoleName; label: string; desc: string }[] = [
  { value: 'developer', label: 'Developer', desc: 'Write, debug, understand code' },
  { value: 'architect', label: 'Architect', desc: 'Design structure, evaluate patterns' },
  { value: 'reviewer', label: 'Reviewer', desc: 'Review changes for correctness' },
  { value: 'tech-writer', label: 'Tech Writer', desc: 'Write and maintain documentation' },
  { value: 'team-lead', label: 'Team Lead', desc: 'Manage tasks, track progress' },
  { value: 'devops', label: 'DevOps', desc: 'CI/CD, infra, deployment' },
  { value: 'data-analyst', label: 'Data Analyst', desc: 'Mine patterns, extract insights' },
  { value: 'onboarding-buddy', label: 'Onboarding Buddy', desc: 'Guide newcomers step by step' },
];

export default function RoleTab() {
  const { state, dispatch } = useBuilderContext();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <SectionToggle sectionId="role" label="Role" />
      <List dense disablePadding>
        {ROLE_OPTIONS.map(opt => (
          <ListItemButton
            key={opt.value}
            selected={state.role === opt.value}
            onClick={() => dispatch({ type: 'SET_ROLE', role: opt.value })}
            sx={{ borderRadius: 1, mb: 0.25 }}
          >
            <ListItemText
              primary={opt.label}
              secondary={opt.desc}
              primaryTypographyProps={{ variant: 'body2' }}
              secondaryTypographyProps={{ variant: 'caption', sx: { lineHeight: 1.2 } }}
            />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
