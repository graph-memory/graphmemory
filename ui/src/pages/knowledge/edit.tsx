import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Alert } from '@mui/material';
import { getNote, updateNote, type Note } from '@/entities/note/index.ts';
import { NoteForm } from '@/features/note-crud/NoteForm.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function NoteEditPage() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const navigate = useNavigate();
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !noteId) return;
    getNote(projectId, noteId)
      .then(setNote)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, noteId]);

  const handleSubmit = async (data: { title: string; content: string; tags: string[] }) => {
    if (!projectId || !noteId) return;
    await updateNote(projectId, noteId, data);
    navigate(`/${projectId}/knowledge/${noteId}`);
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  if (error || !note) {
    return <Alert severity="error">{error || 'Note not found'}</Alert>;
  }

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Knowledge', to: `/${projectId}/knowledge` },
          { label: note.title, to: `/${projectId}/knowledge/${noteId}` },
          { label: 'Edit' },
        ]}
        actions={
          <Button variant="contained" form="note-form" type="submit">
            Save
          </Button>
        }
      />
      <NoteForm
        note={note}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/knowledge/${noteId}`)}
      />
    </Box>
  );
}
