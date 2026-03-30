import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Alert } from '@mui/material';
import { getNote, updateNote, listNoteAttachments, uploadNoteAttachment, deleteNoteAttachment, noteAttachmentUrl, type Note, type AttachmentMeta } from '@/entities/note/index.ts';
import { NoteForm } from '@/features/note-crud/NoteForm.tsx';
import { AttachmentSection } from '@/features/attachments/index.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, Section } from '@/shared/ui/index.ts';

export default function NoteEditPage() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('knowledge');
  const [note, setNote] = useState<Note | null>(null);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttachments = useCallback(async () => {
    if (!projectId || !noteId) return;
    const atts = await listNoteAttachments(projectId, noteId).catch(() => []);
    setAttachments(atts);
  }, [projectId, noteId]);

  useEffect(() => {
    if (!projectId || !noteId) return;
    Promise.all([
      getNote(projectId, noteId).then(setNote),
      loadAttachments(),
    ])
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, noteId, loadAttachments]);

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
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot edit notes.</Alert>}
      <NoteForm
        note={note}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/knowledge/${noteId}`)}
        extraMain={
          <Section title="Attachments" sx={{ mt: 3 }}>
            <AttachmentSection
              attachments={attachments}
              getUrl={(filename) => noteAttachmentUrl(projectId!, noteId!, filename)}
              onUpload={async (file) => {
                await uploadNoteAttachment(projectId!, noteId!, file);
                await loadAttachments();
              }}
              onDelete={async (filename) => {
                await deleteNoteAttachment(projectId!, noteId!, filename);
                await loadAttachments();
              }}
              readOnly={!canWrite}
            />
          </Section>
        }
      />
    </Box>
  );
}
