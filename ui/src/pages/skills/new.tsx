import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Alert } from '@mui/material';
import { createSkill } from '@/entities/skill/index.ts';
import { SkillForm } from '@/features/skill-crud/SkillForm.tsx';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function SkillNewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('skills');

  const handleSubmit = async (data: {
    title: string;
    description: string;
    steps: string[];
    triggers: string[];
    inputHints: string[];
    filePatterns: string[];
    tags: string[];
    source: 'user' | 'learned';
    confidence: number;
  }) => {
    if (!projectId) return;
    const skill = await createSkill(projectId, data);
    navigate(`/${projectId}/skills/${skill.id}`);
  };

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Skills', to: `/${projectId}/skills` },
          { label: 'Create' },
        ]}
        actions={
          <Button variant="contained" form="skill-form" type="submit" disabled={!canWrite}>
            Create
          </Button>
        }
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot create skills.</Alert>}
      <SkillForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/skills`)}
        submitLabel="Create"
      />
    </Box>
  );
}
