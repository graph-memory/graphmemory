import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Select, MenuItem, Box, IconButton,
  FormControl, useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FlagIcon from '@mui/icons-material/Flag';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import {
  createTask, COLUMNS, PRIORITY_COLORS, priorityLabel,
  type TaskStatus, type TaskPriority,
} from '@/entities/task/index.ts';
import { listEpics, linkTaskToEpic, type Epic } from '@/entities/epic/index.ts';
import { listTeam, type TeamMember } from '@/entities/project/api.ts';
import { Tags } from '@/shared/ui/index.ts';

const STATUS_COLOR: Record<TaskStatus, string> = Object.fromEntries(COLUMNS.map(c => [c.status, c.color])) as Record<TaskStatus, string>;

interface QuickCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  defaultStatus?: TaskStatus;
}

export function QuickCreateDialog({ open, onClose, onCreated, defaultStatus }: QuickCreateDialogProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus ?? 'todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<number | ''>('');
  const [epicId, setEpicId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [epics, setEpics] = useState<Epic[]>([]);
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStatus(defaultStatus ?? 'todo');
    setPriority('medium');
    setAssigneeId('');
    setEpicId('');
    setTags([]);
    setTimeout(() => titleRef.current?.focus(), 100);
  };

  useEffect(() => {
    if (open) {
      resetForm();
      if (projectId) {
        listTeam(projectId).then(setTeam).catch(e => console.error('Failed to load team', e));
        listEpics(projectId).then(({ items: list }) => setEpics(list.filter(e => e.status === 'open' || e.status === 'in_progress'))).catch(e => console.error('Failed to load epics', e));
      }
    }
  }, [open, defaultStatus, projectId]);

  const doCreate = async (): Promise<boolean> => {
    if (!title.trim() || !projectId) return false;
    setSaving(true);
    try {
      const task = await createTask(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        tags,
        assigneeId: assigneeId === '' ? undefined : assigneeId,
      });
      if (epicId) {
        await linkTaskToEpic(projectId, epicId, task.id).catch(e => console.error('Failed to link task to epic', e));
      }
      onCreated?.();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (await doCreate()) onClose();
  };

  const handleCreateAnother = async () => {
    if (await doCreate()) resetForm();
  };

  const handleMoreOptions = () => {
    const params = new URLSearchParams();
    if (title.trim()) params.set('title', title.trim());
    if (status !== 'todo') params.set('status', status);
    if (priority !== 'medium') params.set('priority', priority);
    if (assigneeId !== '') params.set('assigneeId', String(assigneeId));
    if (epicId) params.set('epicId', epicId);
    if (tags.length) params.set('tags', tags.join(','));
    onClose();
    if (pathname.includes('/tasks/board')) params.set('from', 'board');
    else if (pathname.includes('/tasks/list')) params.set('from', 'list');
    navigate(`/${projectId}/tasks/new?${params.toString()}`);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        Quick Create Task
        <IconButton size="small" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', sm: 'row' } }}>
          {/* Left column: title + description */}
          <Box sx={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              inputRef={titleRef}
              fullWidth
              label="Title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && title.trim()) handleCreate(); }}
              autoComplete="off"
              size="small"
            />
            <TextField
              fullWidth
              label="Description (markdown)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              multiline
              minRows={7}
              maxRows={14}
              size="small"
            />
          </Box>

          {/* Right column: properties */}
          <Box sx={{ flex: 0.8, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select
                name="qc-status"
                value={status}
                onChange={e => setStatus(e.target.value as TaskStatus)}
                renderValue={v => {
                  const c = STATUS_COLOR[v as TaskStatus];
                  const label = COLUMNS.find(col => col.status === v)?.label ?? v;
                  return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />{label}</Box>;
                }}
              >
                {COLUMNS.map(c => (
                  <MenuItem key={c.status} value={c.status}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.color }} />{c.label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ flex: 1 }}>
              <Select
                name="qc-priority"
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                renderValue={v => {
                  const c = PRIORITY_COLORS[v as TaskPriority];
                  return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c }} />{priorityLabel(v as TaskPriority)}</Box>;
                }}
              >
                {(['critical', 'high', 'medium', 'low'] as const).map(p => (
                  <MenuItem key={p} value={p}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PRIORITY_COLORS[p] }} />{priorityLabel(p)}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            </Box>
            {team.length > 0 && (
              <FormControl size="small" fullWidth>
                <Select
                  name="qc-assignee"
                  value={assigneeId === '' ? '' : String(assigneeId)}
                  onChange={e => setAssigneeId(e.target.value === '' ? '' : Number(e.target.value))}
                  displayEmpty
                  renderValue={v => {
                    if (v === '' || v == null) return <Box sx={{ color: palette.custom.textMuted }}>Assignee</Box>;
                    const m = team.find(t => t.id === Number(v));
                    return m?.name || m?.slug || String(v);
                  }}
                >
                  <MenuItem value="">Unassigned</MenuItem>
                  {team.map(m => <MenuItem key={m.id} value={String(m.id)}>{m.name || m.slug}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {epics.length > 0 && (
              <FormControl size="small" fullWidth>
                <Select
                  name="qc-epic"
                  value={epicId}
                  onChange={e => setEpicId(e.target.value)}
                  displayEmpty
                  renderValue={v => {
                    if (!v) return <Box sx={{ color: palette.custom.textMuted }}>Epic</Box>;
                    const ep = epics.find(e => e.id === v);
                    return <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}><FlagIcon sx={{ fontSize: 14 }} />{ep?.title || v}</Box>;
                  }}
                >
                  <MenuItem value="">No epic</MenuItem>
                  {epics.map(e => (
                    <MenuItem key={e.id} value={e.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FlagIcon sx={{ fontSize: 14, color: e.status === 'open' ? '#1976d2' : '#f57c00' }} />
                        {e.title}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <Tags
              tags={tags}
              editable
              onAdd={tag => setTags(prev => prev.includes(tag) ? prev : [...prev, tag])}
              onRemove={tag => setTags(prev => prev.filter(t => t !== tag))}
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button size="small" startIcon={<OpenInNewIcon />} onClick={handleMoreOptions} sx={{ textTransform: 'none' }}>
          More options
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleCreateAnother}
            disabled={saving || !title.trim()}
            sx={{ textTransform: 'none' }}
          >
            Create & New
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving || !title.trim()}>
            Create
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
