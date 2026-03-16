import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button } from '@mui/material';
import { createNote } from '@/entities/note/index.ts';
import { NoteForm } from '@/features/note-crud/NoteForm.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function NoteNewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const handleSubmit = async (data: { title: string; content: string; tags: string[] }) => {
    if (!projectId) return;
    const note = await createNote(projectId, data);
    navigate(`/${projectId}/knowledge/${note.id}`);
  };

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Knowledge', to: `/${projectId}/knowledge` },
          { label: 'Create' },
        ]}
        actions={
          <Button variant="contained" form="note-form" type="submit">
            Create
          </Button>
        }
      />
      <NoteForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/knowledge`)}
        submitLabel="Create"
      />
    </Box>
  );
}
