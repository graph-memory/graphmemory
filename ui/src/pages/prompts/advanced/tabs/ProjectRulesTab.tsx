import { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import { useBuilderContext } from '../context/BuilderContext.tsx';
import SectionToggle from './SectionToggle.tsx';
import type { ProjectRulesConfig } from '../types.ts';

function EditableList({
  label,
  hint,
  items,
  onChange,
}: {
  label: string;
  hint: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = useCallback(() => {
    const value = input.trim();
    if (value && !items.includes(value)) {
      onChange([...items, value]);
      setInput('');
    }
  }, [input, items, onChange]);

  return (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: 'block' }}>{label}</Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.75 }}>
        {items.map(item => (
          <Chip
            key={item}
            label={item}
            size="small"
            onDelete={() => onChange(items.filter(i => i !== item))}
            sx={{ fontSize: '0.7rem' }}
          />
        ))}
      </Box>
      <TextField
        size="small"
        placeholder={hint}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        fullWidth
        sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem' } }}
      />
    </Box>
  );
}

export default function ProjectRulesTab() {
  const { state, dispatch, ensureSectionEnabled } = useBuilderContext();
  const r = state.projectRules;

  const update = (patch: Partial<ProjectRulesConfig>) => {
    dispatch({ type: 'SET_PROJECT_RULES', rules: { ...r, ...patch } });
    ensureSectionEnabled('rules');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <SectionToggle sectionId="rules" label="Project Rules" />

      <EditableList
        label="Focus Patterns"
        hint="e.g. src/api/**, *.controller.ts (press Enter)"
        items={r.focusPatterns}
        onChange={v => update({ focusPatterns: v })}
      />

      <EditableList
        label="Ignore Patterns"
        hint="e.g. node_modules/**, dist/**, *.test.ts"
        items={r.ignorePatterns}
        onChange={v => update({ ignorePatterns: v })}
      />

      <Divider />

      <EditableList
        label="Naming Conventions"
        hint="e.g. Use camelCase for functions, PascalCase for classes"
        items={r.namingConventions}
        onChange={v => update({ namingConventions: v })}
      />

      <EditableList
        label="Code Style Rules"
        hint="e.g. No default exports, Prefer async/await over .then()"
        items={r.codeStyleRules}
        onChange={v => update({ codeStyleRules: v })}
      />

      <Divider />

      <EditableList
        label="Architecture Patterns"
        hint="e.g. Repository pattern for data access, DI for services"
        items={r.architecturePatterns}
        onChange={v => update({ architecturePatterns: v })}
      />

      <EditableList
        label="Anti-Patterns to Flag"
        hint="e.g. No direct DB queries in controllers, No any types"
        items={r.antiPatterns}
        onChange={v => update({ antiPatterns: v })}
      />
    </Box>
  );
}
