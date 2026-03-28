import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Typography, Alert, CircularProgress } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  getNote, deleteNote, listRelations,
  listNoteAttachments, uploadNoteAttachment, deleteNoteAttachment, noteAttachmentUrl,
  type Note, type Relation, type AttachmentMeta,
} from '@/entities/note/index.ts';
import { RelationManager } from '@/features/relation-manager/index.ts';
import { AttachmentSection } from '@/features/attachments/index.ts';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, Section, FieldRow, Tags, CopyButton, ConfirmDialog, MarkdownRenderer, DateDisplay, DetailLayout } from '@/shared/ui/index.ts';

export default function NoteDetailPage() {
  const { projectId, noteId } = useParams<{ projectId: string; noteId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('knowledge');
  const [note, setNote] = useState<Note | null>(null);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !noteId) return;
    try {
      const [n, rels, atts] = await Promise.all([
        getNote(projectId, noteId),
        listRelations(projectId, noteId),
        listNoteAttachments(projectId, noteId),
      ]);
      setNote(n);
      setRelations(rels);
      setAttachments(atts);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, noteId]);

  useEffect(() => { load(); }, [load]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('note:')) load();
  }, [load]));

  const handleDelete = async () => {
    if (!projectId || !noteId) return;
    await deleteNote(projectId, noteId);
    navigate(`/${projectId}/knowledge`);
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
          { label: note.title },
        ]}
        actions={
          canWrite ? (
            <>
              <Button variant="contained" color="success" startIcon={<EditIcon />} onClick={() => navigate(`/${projectId}/knowledge/${noteId}/edit`)}>
                Edit
              </Button>
              <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteConfirm(true)}>
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <DetailLayout
        main={
          <>
            {note.content && (
              <Section title="Content" sx={{ mb: 3 }}>
                <MarkdownRenderer>{note.content}</MarkdownRenderer>
              </Section>
            )}
          </>
        }
        sidebar={
          <>
            <Section title="Details" sx={{ mb: 3 }}>
              <FieldRow label="ID">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{note.id}</Typography>
                  <CopyButton value={note.id} />
                </Box>
              </FieldRow>
              <FieldRow label="Version">
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>v{note.version}</Typography>
              </FieldRow>
              <FieldRow label="Tags">
                {note.tags.length > 0 ? <Tags tags={note.tags} /> : <Typography variant="body2" color="text.secondary">—</Typography>}
              </FieldRow>
              {note.createdBy && (
                <FieldRow label="Created by">
                  <Typography variant="body2">{note.createdBy}</Typography>
                </FieldRow>
              )}
              {note.updatedBy && note.updatedBy !== note.createdBy && (
                <FieldRow label="Updated by">
                  <Typography variant="body2">{note.updatedBy}</Typography>
                </FieldRow>
              )}
              <FieldRow label="Created">
                <DateDisplay value={note.createdAt} showTime showRelative />
              </FieldRow>
              <FieldRow label="Updated" divider={false}>
                <DateDisplay value={note.updatedAt} showTime showRelative />
              </FieldRow>
            </Section>

            <Section title="Attachments" sx={{ mb: 3 }}>
              <AttachmentSection
                attachments={attachments}
                getUrl={(filename) => noteAttachmentUrl(projectId!, noteId!, filename)}
                onUpload={async (file) => {
                  await uploadNoteAttachment(projectId!, noteId!, file);
                  const atts = await listNoteAttachments(projectId!, noteId!);
                  setAttachments(atts);
                }}
                onDelete={async (filename) => {
                  await deleteNoteAttachment(projectId!, noteId!, filename);
                  const atts = await listNoteAttachments(projectId!, noteId!);
                  setAttachments(atts);
                }}
                readOnly={!canWrite}
              />
            </Section>

            <Section title="Relations">
              <RelationManager
                projectId={projectId!}
                entityId={noteId!}
                entityType="knowledge"
                relations={relations}
                onRefresh={load}
              />
            </Section>
          </>
        }
      />

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete Note"
        message={`Are you sure you want to delete "${note.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </Box>
  );
}
