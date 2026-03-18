import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Alert } from '@mui/material';
import { getSkill, updateSkill, type Skill } from '@/entities/skill/index.ts';
import { SkillForm } from '@/features/skill-crud/SkillForm.tsx';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar } from '@/shared/ui/index.ts';

export default function SkillEditPage() {
  const { projectId, skillId } = useParams<{ projectId: string; skillId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('skills');
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !skillId) return;
    getSkill(projectId, skillId)
      .then(setSkill)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, skillId]);

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
    if (!projectId || !skillId) return;
    await updateSkill(projectId, skillId, data);
    navigate(`/${projectId}/skills/${skillId}`);
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  if (error || !skill) {
    return <Alert severity="error">{error || 'Skill not found'}</Alert>;
  }

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Skills', to: `/${projectId}/skills` },
          { label: skill.title, to: `/${projectId}/skills/${skillId}` },
          { label: 'Edit' },
        ]}
        actions={
          <Button variant="contained" form="skill-form" type="submit" disabled={!canWrite}>
            Save
          </Button>
        }
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot edit skills.</Alert>}
      <SkillForm
        skill={skill}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/skills/${skillId}`)}
      />
    </Box>
  );
}
