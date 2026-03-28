import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Button, Select, MenuItem,
  CircularProgress,
} from '@mui/material';
import { Section, FormGrid, FormField, FieldLabel, AppTextField, Tags, MarkdownEditor } from '@/shared/ui/index.ts';
import { COLUMNS, PRIORITY_COLORS, type Task, type TaskStatus, type TaskPriority } from '@/entities/task/index.ts';

const STATUS_COLOR: Record<TaskStatus, string> = Object.fromEntries(COLUMNS.map(c => [c.status, c.color])) as Record<TaskStatus, string>;
const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];
import { listTeam, type TeamMember } from '@/entities/project/api.ts';

interface TaskFormDefaults {
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
  tags?: string[];
}

interface TaskFormProps {
  task?: Task;
  defaults?: TaskFormDefaults;
  onSubmit: (data: { title: string; description: string; status: TaskStatus; priority: TaskPriority; tags: string[]; dueDate?: number | null; estimate?: number | null; assignee?: string | null }) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function TaskForm({ task, defaults, onSubmit, onCancel, submitLabel = 'Save' }: TaskFormProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [tags, setTags] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [estimate, setEstimate] = useState('');
  const [assignee, setAssignee] = useState<string>('');
  const [team, setTeam] = useState<TeamMember[]>([]);
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
      setAssignee(task.assignee ?? '');
    } else if (defaults) {
      if (defaults.title) setTitle(defaults.title);
      if (defaults.status) setStatus(defaults.status);
      if (defaults.priority) setPriority(defaults.priority);
      if (defaults.assignee) setAssignee(defaults.assignee);
      if (defaults.tags) setTags(defaults.tags);
    }
  }, [task]);

  useEffect(() => {
    if (!projectId) return;
    listTeam(projectId).then(setTeam).catch(() => {});
  }, [projectId]);

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
        assignee: assignee || null,
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
            <AppTextField
              fieldLabel="Title"
              required
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
            <Select
              fullWidth value={status}
              onChange={e => setStatus(e.target.value as TaskStatus)}
              renderValue={v => {
                const c = STATUS_COLOR[v as TaskStatus];
                const label = COLUMNS.find(col => col.status === v)?.label ?? v;
                return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c }} />{label}</Box>;
              }}
              sx={{ '& .MuiSelect-select': { display: 'flex', alignItems: 'center' } }}
            >
              {COLUMNS.map(c => (
                <MenuItem key={c.status} value={c.status}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color }} />{c.label}
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
                const c = PRIORITY_COLORS[v as TaskPriority];
                const label = PRIORITY_OPTIONS.find(p => p.value === v)?.label ?? v;
                return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c }} />{label}</Box>;
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
          <FormField>
            <AppTextField
              fieldLabel="Due Date"
              fullWidth
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
            />
          </FormField>
          <FormField>
            <AppTextField
              fieldLabel="Estimate (hours)"
              fullWidth
              type="number"
              value={estimate}
              onChange={e => setEstimate(e.target.value)}
              slotProps={{ input: { inputProps: { min: 0, step: 0.5 } } }}
            />
          </FormField>
          <FormField>
            <FieldLabel>Assignee</FieldLabel>
            <Select
              fullWidth
              value={assignee}
              onChange={e => setAssignee(e.target.value)}
              displayEmpty
              renderValue={v => {
                if (!v) return 'Unassigned';
                const m = team.find(t => t.id === v);
                return m?.name || v;
              }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {team.map(m => <MenuItem key={m.id} value={m.id}>{m.name || m.id}</MenuItem>)}
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
