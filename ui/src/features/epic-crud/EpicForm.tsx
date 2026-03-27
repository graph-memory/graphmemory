import { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Select, MenuItem,
  CircularProgress,
} from '@mui/material';
import { Section, FormGrid, FormField, FieldLabel, Tags, MarkdownEditor } from '@/shared/ui/index.ts';
import type { Epic, EpicStatus } from '@/entities/epic/index.ts';
import type { TaskPriority } from '@/entities/task/index.ts';
import { PRIORITY_COLORS } from '@/entities/task/index.ts';

const EPIC_STATUSES: { value: EpicStatus; label: string; color: string }[] = [
  { value: 'open', color: '#1976d2', label: 'Open' },
  { value: 'in_progress', color: '#f57c00', label: 'In Progress' },
  { value: 'done', color: '#388e3c', label: 'Done' },
  { value: 'cancelled', color: '#d32f2f', label: 'Cancelled' },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

interface EpicFormProps {
  epic?: Epic;
  onSubmit: (data: { title: string; description: string; status: EpicStatus; priority: TaskPriority; tags: string[] }) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function EpicForm({ epic, onSubmit, onCancel, submitLabel = 'Save' }: EpicFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<EpicStatus>('open');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (epic) {
      setTitle(epic.title);
      setDescription(epic.description);
      setStatus(epic.status);
      setPriority(epic.priority);
      setTags(epic.tags ?? []);
    }
  }, [epic]);

  const handleSubmit = async () => {
    if (!title.trim()) { setTitleError(true); return; }
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), description: description.trim(), status, priority, tags });
    } finally { setSaving(false); }
  };

  return (
    <Box component="form" id="epic-form" onSubmit={e => { e.preventDefault(); handleSubmit(); }} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Section title="Details">
        <FormGrid>
          <FormField fullWidth>
            <FieldLabel required>Title</FieldLabel>
            <TextField
              autoFocus fullWidth value={title}
              onChange={e => { setTitle(e.target.value); setTitleError(false); }}
              error={titleError}
              helperText={titleError ? 'Title is required' : undefined}
            />
          </FormField>
          <FormField fullWidth>
            <FieldLabel>Description</FieldLabel>
            <MarkdownEditor value={description} onChange={setDescription} height={250} />
          </FormField>
        </FormGrid>
      </Section>

      <Section title="Properties">
        <FormGrid>
          <FormField>
            <FieldLabel>Status</FieldLabel>
            <Select
              fullWidth value={status}
              onChange={e => setStatus(e.target.value as EpicStatus)}
              renderValue={v => {
                const s = EPIC_STATUSES.find(s => s.value === v);
                return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s?.color }} />{s?.label}</Box>;
              }}
              sx={{ '& .MuiSelect-select': { display: 'flex', alignItems: 'center' } }}
            >
              {EPIC_STATUSES.map(s => (
                <MenuItem key={s.value} value={s.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color }} />{s.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormField>
          <FormField>
            <FieldLabel>Priority</FieldLabel>
            <Select
              fullWidth value={priority}
              onChange={e => setPriority(e.target.value as TaskPriority)}
              renderValue={v => {
                const p = PRIORITY_OPTIONS.find(p => p.value === v);
                const c = PRIORITY_COLORS[v as TaskPriority];
                return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c }} />{p?.label}</Box>;
              }}
              sx={{ '& .MuiSelect-select': { display: 'flex', alignItems: 'center' } }}
            >
              {PRIORITY_OPTIONS.map(p => (
                <MenuItem key={p.value} value={p.value}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: PRIORITY_COLORS[p.value] }} />{p.label}
                  </Box>
                </MenuItem>
              ))}
            </Select>
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
