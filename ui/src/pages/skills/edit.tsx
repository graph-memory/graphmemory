import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Alert } from '@mui/material';
import { getSkill, updateSkill, listSkillAttachments, uploadSkillAttachment, deleteSkillAttachment, skillAttachmentUrl, type Skill, type AttachmentMeta } from '@/entities/skill/index.ts';
import { SkillForm } from '@/features/skill-crud/SkillForm.tsx';
import { AttachmentSection } from '@/features/attachments/index.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, Section } from '@/shared/ui/index.ts';

export default function SkillEditPage() {
  const { projectId, skillId } = useParams<{ projectId: string; skillId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('skills');
  const [skill, setSkill] = useState<Skill | null>(null);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttachments = useCallback(async () => {
    if (!projectId || !skillId) return;
    const atts = await listSkillAttachments(projectId, skillId).catch(() => []);
    setAttachments(atts);
  }, [projectId, skillId]);

  useEffect(() => {
    if (!projectId || !skillId) return;
    Promise.all([
      getSkill(projectId, skillId).then(setSkill),
      loadAttachments(),
    ])
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, skillId, loadAttachments]);

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
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot edit skills.</Alert>}
      <SkillForm
        skill={skill}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/skills/${skillId}`)}
        extraMain={
          <Section title="Attachments" sx={{ mt: 3 }}>
            <AttachmentSection
              attachments={attachments}
              getUrl={(filename) => skillAttachmentUrl(projectId!, skillId!, filename)}
              onUpload={async (file) => {
                await uploadSkillAttachment(projectId!, skillId!, file);
                await loadAttachments();
              }}
              onDelete={async (filename) => {
                await deleteSkillAttachment(projectId!, skillId!, filename);
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
