import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box, Button, Select, MenuItem,
  CircularProgress,
} from '@mui/material';
import FlagIcon from '@mui/icons-material/Flag';
import { Section, FieldLabel, AppTextField, Tags, MarkdownEditor, DetailLayout } from '@/shared/ui/index.ts';
import { COLUMNS, PRIORITY_COLORS, listTaskRelations, type Task, type TaskStatus, type TaskPriority } from '@/entities/task/index.ts';
import { listEpics, linkTaskToEpic, unlinkTaskFromEpic, type Epic } from '@/entities/epic/index.ts';

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
  const [epics, setEpics] = useState<Epic[]>([]);
  const [selectedEpicIds, setSelectedEpicIds] = useState<string[]>([]);
  const [initialEpicIds, setInitialEpicIds] = useState<string[]>([]);
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
    listEpics(projectId).then(({ items }) => setEpics(items)).catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (!projectId || !task) return;
    listTaskRelations(projectId, task.id).then(rels => {
      const epicIds = rels.filter(r => r.kind === 'belongs_to').map(r => r.toId);
      setSelectedEpicIds(epicIds);
      setInitialEpicIds(epicIds);
    }).catch(() => {});
  }, [projectId, task]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      const result = await onSubmit({
        title: title.trim(),
        description: description.trim(),
        status,
        priority,
        tags,
        dueDate: dueDate ? new Date(dueDate).getTime() : null,
        estimate: estimate ? Number(estimate) : null,
        assignee: assignee || null,
      });

      // Sync epic links after save
      if (projectId) {
        const taskId = task?.id ?? (result as any)?.id;
        if (taskId) {
          const toLink = selectedEpicIds.filter(id => !initialEpicIds.includes(id));
          const toUnlink = initialEpicIds.filter(id => !selectedEpicIds.includes(id));
          await Promise.all([
            ...toLink.map(epicId => linkTaskToEpic(projectId, epicId, taskId)),
            ...toUnlink.map(epicId => unlinkTaskFromEpic(projectId, epicId, taskId)),
          ]);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box component="form" id="task-form" onSubmit={e => { e.preventDefault(); handleSubmit(); }} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <DetailLayout
        main={
          <Section title="Details">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
              <Box>
                <FieldLabel>Description</FieldLabel>
                <MarkdownEditor value={description} onChange={setDescription} height={400} />
              </Box>
            </Box>
          </Section>
        }
        sidebar={
          <Section title="Properties">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box>
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
              </Box>
              <Box>
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
              </Box>
              <AppTextField fieldLabel="Due Date" fullWidth type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              <AppTextField fieldLabel="Estimate (hours)" fullWidth type="number" value={estimate} onChange={e => setEstimate(e.target.value)} slotProps={{ input: { inputProps: { min: 0, step: 0.5 } } }} />
              <Box>
                <FieldLabel>Assignee</FieldLabel>
                <Select
                  fullWidth value={assignee} onChange={e => setAssignee(e.target.value)} displayEmpty
                  renderValue={v => { if (!v) return 'Unassigned'; const m = team.find(t => t.id === v); return m?.name || v; }}
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {team.map(m => <MenuItem key={m.id} value={m.id}>{m.name || m.id}</MenuItem>)}
                </Select>
              </Box>
              {epics.length > 0 && (
                <Box>
                  <FieldLabel>Epics</FieldLabel>
                  <Select
                    fullWidth multiple value={selectedEpicIds}
                    onChange={e => setSelectedEpicIds(e.target.value as string[])}
                    displayEmpty
                    renderValue={selected => {
                      if ((selected as string[]).length === 0) return 'No epic';
                      return (selected as string[]).map(id => epics.find(e => e.id === id)?.title ?? id).join(', ');
                    }}
                  >
                    {epics.filter(e => e.status === 'open' || e.status === 'in_progress' || selectedEpicIds.includes(e.id)).map(e => (
                      <MenuItem key={e.id} value={e.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <FlagIcon sx={{ fontSize: 14, color: e.status === 'open' ? '#1976d2' : e.status === 'in_progress' ? '#f57c00' : '#388e3c' }} />
                          {e.title}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              )}
              <Tags tags={tags} editable onAdd={tag => setTags(prev => prev.includes(tag) ? prev : [...prev, tag])} onRemove={tag => setTags(prev => prev.filter(t => t !== tag))} />
            </Box>
          </Section>
        }
      />

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving || !title.trim()}>
          {saving ? <CircularProgress size={20} /> : submitLabel}
        </Button>
      </Box>
    </Box>
  );
}
