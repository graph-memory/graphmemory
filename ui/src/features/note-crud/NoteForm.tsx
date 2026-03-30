import { useState, useEffect } from 'react';
import { Box, Button, CircularProgress } from '@mui/material';
import { DetailLayout, FieldLabel, AppTextField, Tags, MarkdownEditor } from '@/shared/ui/index.ts';
import type { Note } from '@/entities/note/index.ts';

interface NoteFormProps {
  note?: Note;
  onSubmit: (data: { title: string; content: string; tags: string[] }) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  extraMain?: React.ReactNode;
}

export function NoteForm({ note, onSubmit, onCancel, submitLabel = 'Save', extraMain }: NoteFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState(false);

  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
      setTags(note.tags ?? []);
    }
  }, [note]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setTitleError(true);
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), content: content.trim(), tags });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box component="form" id="note-form" onSubmit={e => { e.preventDefault(); handleSubmit(); }} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <DetailLayout
        main={
          <>
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
                <FieldLabel>Content</FieldLabel>
                <MarkdownEditor value={content} onChange={setContent} height={400} />
              </Box>
            </Box>
            {extraMain}
          </>
        }
        sidebar={
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Tags
              tags={tags}
              editable
              onAdd={tag => setTags(prev => prev.includes(tag) ? prev : [...prev, tag])}
              onRemove={tag => setTags(prev => prev.filter(t => t !== tag))}
            />
          </Box>
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
