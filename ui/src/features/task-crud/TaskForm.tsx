import { useState, useEffect } from 'react';
import {
  Box, Button, TextField, Select, MenuItem,
  CircularProgress,
} from '@mui/material';
import { Section, FormGrid, FormField, FieldLabel, Tags, MarkdownEditor } from '@/shared/ui/index.ts';
import { COLUMNS, type Task, type TaskStatus, type TaskPriority } from '@/entities/task/index.ts';

interface TaskFormProps {
  task?: Task;
  onSubmit: (data: { title: string; description: string; status: TaskStatus; priority: TaskPriority; tags: string[]; dueDate?: number | null; estimate?: number | null }) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function TaskForm({ task, onSubmit, onCancel, submitLabel = 'Save' }: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [tags, setTags] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [estimate, setEstimate] = useState('');
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setStatus(task.status);
      setPriority(task.priority);
      setTags(task.tags ?? []);
      setDueDate(task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '');
      setEstimate(task.estimate != null ? String(task.estimate) : '');
    }
  }, [task]);

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
        status,
        priority,
        tags,
        dueDate: dueDate ? new Date(dueDate).getTime() : null,
        estimate: estimate ? Number(estimate) : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box component="form" id="task-form" onSubmit={e => { e.preventDefault(); handleSubmit(); }} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
            <MarkdownEditor value={description} onChange={setDescription} height={250} />
          </FormField>
        </FormGrid>
      </Section>

      <Section title="Properties">
        <FormGrid>
          <FormField>
            <FieldLabel>Status</FieldLabel>
            <Select fullWidth value={status} onChange={e => setStatus(e.target.value as TaskStatus)}>
              {COLUMNS.map(c => <MenuItem key={c.status} value={c.status}>{c.label}</MenuItem>)}
            </Select>
          </FormField>
          <FormField>
            <FieldLabel>Priority</FieldLabel>
            <Select fullWidth value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}>
              <MenuItem value="critical">Critical</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="low">Low</MenuItem>
            </Select>
          </FormField>
          <FormField>
            <FieldLabel>Due Date</FieldLabel>
            <TextField
              fullWidth
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </FormField>
          <FormField>
            <FieldLabel>Estimate (hours)</FieldLabel>
            <TextField
              fullWidth
              type="number"
              value={estimate}
              onChange={e => setEstimate(e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: 0.5 } } }}
            />
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
