import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import SectionToggle from './SectionToggle.tsx';
import type { TechStackConfig } from '../types.ts';
import {
  LANGUAGES, RUNTIMES, FRAMEWORKS, FRAMEWORK_GROUPS,
  PARADIGMS, TESTING_APPROACHES, PACKAGE_MANAGERS,
} from '@/content/prompts/catalogs.ts';

function ChipGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {options.map(opt => {
          const active = selected.includes(opt);
          return (
            <Chip
              key={opt}
              label={opt}
              size="small"
              onClick={() => onToggle(opt)}
              sx={active
                ? { bgcolor: 'primary.main', color: '#fff', '&:hover': { bgcolor: 'primary.dark' } }
                : { opacity: 0.6 }
              }
            />
          );
        })}
      </Box>
    </Box>
  );
}

export default function TechStackTab() {
  const { state, dispatch, ensureSectionEnabled } = useBuilderContext();
  const ts = state.techStack;

  const toggle = (key: keyof TechStackConfig, value: string) => {
    const current = ts[key] as string[];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    dispatch({ type: 'UPDATE_TECH_STACK', key, value: next });
    ensureSectionEnabled('tech-stack');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionToggle sectionId="tech-stack" label="Tech Stack" />
      <Typography variant="overline" sx={{ color: 'text.secondary' }}>
        JS/TS Ecosystem
      </Typography>

      <ChipGroup label="Language" options={LANGUAGES} selected={ts.languages} onToggle={v => toggle('languages', v)} />
      <ChipGroup label="Runtime" options={RUNTIMES} selected={ts.runtimes} onToggle={v => toggle('runtimes', v)} />

      <Divider />

      {FRAMEWORK_GROUPS.map(group => (
        <ChipGroup
          key={group.key}
          label={group.label}
          options={FRAMEWORKS[group.key]}
          selected={ts[group.key] as string[]}
          onToggle={v => toggle(group.key, v)}
        />
      ))}

      <Divider />

      <ChipGroup label="Paradigms" options={PARADIGMS} selected={ts.paradigms} onToggle={v => toggle('paradigms', v)} />
      <ChipGroup label="Testing Approach" options={TESTING_APPROACHES} selected={ts.testingApproaches} onToggle={v => toggle('testingApproaches', v)} />
      <ChipGroup label="Package Manager" options={PACKAGE_MANAGERS} selected={ts.packageManager} onToggle={v => toggle('packageManager', v)} />
    </Box>
  );
}
