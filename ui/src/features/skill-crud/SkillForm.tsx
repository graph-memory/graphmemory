import { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Select, MenuItem, Typography,
  CircularProgress, IconButton, Slider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { Section, FormGrid, FormField, FieldLabel, Tags, MarkdownEditor } from '@/shared/ui/index.ts';
import type { Skill } from '@/entities/skill/index.ts';

interface SkillFormProps {
  skill?: Skill;
  onSubmit: (data: {
    title: string;
    description: string;
    steps: string[];
    triggers: string[];
    inputHints: string[];
    filePatterns: string[];
    tags: string[];
    source: 'user' | 'learned';
    confidence: number;
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function SkillForm({ skill, onSubmit, onCancel, submitLabel = 'Save' }: SkillFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [inputHints, setInputHints] = useState<string[]>([]);
  const [filePatterns, setFilePatterns] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [source, setSource] = useState<'user' | 'learned'>('user');
  const [confidence, setConfidence] = useState(1);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (skill) {
      setTitle(skill.title);
      setDescription(skill.description);
      setSteps(skill.steps.length > 0 ? skill.steps : ['']);
      setTriggers(skill.triggers ?? []);
      setInputHints(skill.inputHints ?? []);
      setFilePatterns(skill.filePatterns ?? []);
      setTags(skill.tags ?? []);
      setSource(skill.source);
      setConfidence(skill.confidence);
    }
  }, [skill]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        steps: steps.map(s => s.trim()).filter(Boolean),
        triggers,
        inputHints,
        filePatterns,
        tags,
        source,
        confidence,
      });
    } finally {
      setSaving(false);
    }
  };

  const updateStep = (index: number, value: string) => {
    setSteps(prev => prev.map((s, i) => i === index ? value : s));
  };

  const addStep = () => {
    setSteps(prev => [...prev, '']);
  };

  const removeStep = (index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Box component="form" id="skill-form" onSubmit={e => { e.preventDefault(); handleSubmit(); }} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Section title="Details">
        <FormGrid>
          <FormField fullWidth>
            <FieldLabel required>Title</FieldLabel>
            <TextField
              autoFocus
              fullWidth
              value={title}
              onChange={e => { setTitle(e.target.value); setTitleError(false); }}
              error={titleError}
              helperText={titleError ? 'Title is required' : undefined}
            />
          </FormField>
          <FormField fullWidth>
            <FieldLabel>Description</FieldLabel>
            <MarkdownEditor value={description} onChange={setDescription} height={200} />
          </FormField>
        </FormGrid>
      </Section>

      <Section title="Steps">
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {steps.map((step, index) => (
            <Box key={index} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ minWidth: 24, color: 'text.secondary' }}>
                {index + 1}.
              </Typography>
              <TextField
                fullWidth
                size="small"
                value={step}
                onChange={e => updateStep(index, e.target.value)}
                placeholder={`Step ${index + 1}`}
              />
              {steps.length > 1 && (
                <IconButton size="small" onClick={() => removeStep(index)} color="error">
                  <RemoveCircleOutlineIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={addStep} sx={{ alignSelf: 'flex-start' }}>
            Add Step
          </Button>
        </Box>
      </Section>

      <Section title="Matching">
        <FormGrid>
          <FormField fullWidth>
            <FieldLabel>Triggers</FieldLabel>
            <Tags
              tags={triggers}
              editable
              onAdd={tag => setTriggers(prev => prev.includes(tag) ? prev : [...prev, tag])}
              onRemove={tag => setTriggers(prev => prev.filter(t => t !== tag))}
            />
          </FormField>
          <FormField fullWidth>
            <FieldLabel>Input Hints</FieldLabel>
            <Tags
              tags={inputHints}
              editable
              onAdd={tag => setInputHints(prev => prev.includes(tag) ? prev : [...prev, tag])}
              onRemove={tag => setInputHints(prev => prev.filter(t => t !== tag))}
            />
          </FormField>
          <FormField fullWidth>
            <FieldLabel>File Patterns</FieldLabel>
            <Tags
              tags={filePatterns}
              editable
              onAdd={tag => setFilePatterns(prev => prev.includes(tag) ? prev : [...prev, tag])}
              onRemove={tag => setFilePatterns(prev => prev.filter(t => t !== tag))}
            />
          </FormField>
        </FormGrid>
      </Section>

      <Section title="Properties">
        <FormGrid>
          <FormField>
            <FieldLabel>Source</FieldLabel>
            <Select fullWidth value={source} onChange={e => setSource(e.target.value as 'user' | 'learned')}>
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="learned">Learned</MenuItem>
            </Select>
          </FormField>
          <FormField>
            <Box sx={{ px: 1 }}>
              <FieldLabel>Confidence: {Math.round(confidence * 100)}%</FieldLabel>
              <Slider
                value={confidence}
                onChange={(_e, v) => setConfidence(v as number)}
                min={0}
                max={1}
                step={0.01}
                valueLabelDisplay="auto"
                valueLabelFormat={v => `${Math.round(v * 100)}%`}
              />
            </Box>
          </FormField>
          <FormField fullWidth>
            <Tags
              tags={tags}
              editable
              onAdd={tag => setTags(prev => prev.includes(tag) ? prev : [...prev, tag])}
              onRemove={tag => setTags(prev => prev.filter(t => t !== tag))}
            />
          </FormField>
        </FormGrid>
      </Section>

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving || !title.trim()}>
          {saving ? <CircularProgress size={20} /> : submitLabel}
        </Button>
      </Box>
    </Box>
  );
}
