import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Alert } from '@mui/material';
import { createSkill, uploadSkillAttachment } from '@/entities/skill/index.ts';
import { SkillForm } from '@/features/skill-crud/SkillForm.tsx';
import { StagedAttachments } from '@/features/attachments/index.ts';
import { useCanWrite } from '@/shared/lib/AccessContext.tsx';
import { PageTopBar, Section } from '@/shared/ui/index.ts';

export default function SkillNewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const canWrite = useCanWrite('skills');
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

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
    for (const file of stagedFiles) {
      await uploadSkillAttachment(projectId, skill.id, file).catch(() => {});
    }
    navigate(`/${projectId}/skills/${skill.id}`);
  };

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Skills', to: `/${projectId}/skills` },
          { label: 'Create' },
        ]}
      />
      {!canWrite && <Alert severity="warning" sx={{ mb: 2 }}>Read-only access — you cannot create skills.</Alert>}
      <SkillForm
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/${projectId}/skills`)}
        submitLabel="Create"
        extraMain={
          <Section title="Attachments" sx={{ mt: 3 }}>
            <StagedAttachments
              files={stagedFiles}
              onAdd={files => setStagedFiles(prev => [...prev, ...files])}
              onRemove={index => setStagedFiles(prev => prev.filter((_, i) => i !== index))}
            />
          </Section>
        }
      />
    </Box>
  );
}
