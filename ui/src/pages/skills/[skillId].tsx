import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Button, Typography, Alert, CircularProgress, Chip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  getSkill, deleteSkill, listSkillRelations,
  listSkillAttachments, uploadSkillAttachment, deleteSkillAttachment, skillAttachmentUrl,
  type Skill, type SkillRelation, type AttachmentMeta,
} from '@/entities/skill/index.ts';
import { sourceLabel, confidenceLabel, SOURCE_BADGE_COLOR } from '@/entities/skill/index.ts';
import { RelationManager } from '@/features/relation-manager/index.ts';
import { AttachmentSection } from '@/features/attachments/index.ts';
import { useWebSocket } from '@/shared/lib/useWebSocket.ts';
import { PageTopBar, Section, FieldRow, Tags, CopyButton, ConfirmDialog, MarkdownRenderer, StatusBadge } from '@/shared/ui/index.ts';

export default function SkillDetailPage() {
  const { projectId, skillId } = useParams<{ projectId: string; skillId: string }>();
  const navigate = useNavigate();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [relations, setRelations] = useState<SkillRelation[]>([]);
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!projectId || !skillId) return;
    try {
      const [s, rels, atts] = await Promise.all([
        getSkill(projectId, skillId),
        listSkillRelations(projectId, skillId),
        listSkillAttachments(projectId, skillId),
      ]);
      setSkill(s);
      setRelations(rels);
      setAttachments(atts);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, skillId]);

  useEffect(() => { load(); }, [load]);

  useWebSocket(projectId ?? null, useCallback((event) => {
    if (event.type.startsWith('skill:')) load();
  }, [load]));

  const handleDelete = async () => {
    if (!projectId || !skillId) return;
    await deleteSkill(projectId, skillId);
    navigate(`/${projectId}/skills`);
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
          { label: skill.title },
        ]}
        actions={
          <>
            <Button variant="contained" color="success" startIcon={<EditIcon />} onClick={() => navigate(`/${projectId}/skills/${skillId}/edit`)}>
              Edit
            </Button>
            <Button color="error" startIcon={<DeleteIcon />} onClick={() => setDeleteConfirm(true)}>
              Delete
            </Button>
          </>
        }
      />

      <Section title="Details" sx={{ mb: 3 }}>
        <FieldRow label="ID">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{skill.id}</Typography>
            <CopyButton value={skill.id} />
          </Box>
        </FieldRow>
        <FieldRow label="Source">
          <StatusBadge label={sourceLabel(skill.source)} color={SOURCE_BADGE_COLOR[skill.source] ?? 'primary'} />
        </FieldRow>
        <FieldRow label="Confidence">
          <Typography variant="body2">{confidenceLabel(skill.confidence)}</Typography>
        </FieldRow>
        <FieldRow label="Usage Count">
          <Typography variant="body2">{skill.usageCount}</Typography>
        </FieldRow>
        {skill.lastUsedAt && (
          <FieldRow label="Last Used">
            <Typography variant="body2">{new Date(skill.lastUsedAt).toLocaleString()}</Typography>
          </FieldRow>
        )}
        <FieldRow label="Created">
          <Typography variant="body2">{new Date(skill.createdAt).toLocaleString()}</Typography>
        </FieldRow>
        <FieldRow label="Updated">
          <Typography variant="body2">{new Date(skill.updatedAt).toLocaleString()}</Typography>
        </FieldRow>
        <FieldRow label="Tags">
          {skill.tags.length > 0 ? <Tags tags={skill.tags} /> : <Typography variant="body2" color="text.secondary">—</Typography>}
        </FieldRow>
        {skill.description && (
          <FieldRow label="Description" divider={false}>
            <MarkdownRenderer>{skill.description}</MarkdownRenderer>
          </FieldRow>
        )}
      </Section>

      {skill.steps.length > 0 && (
        <Section title="Steps" sx={{ mb: 3 }}>
          <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
            {skill.steps.map((step, i) => (
              <Typography component="li" key={i} variant="body2" sx={{ mb: 0.5 }}>
                {step}
              </Typography>
            ))}
          </Box>
        </Section>
      )}

      {skill.triggers.length > 0 && (
        <Section title="Triggers" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {skill.triggers.map((t, i) => (
              <Chip key={i} label={t} size="small" variant="outlined" />
            ))}
          </Box>
        </Section>
      )}

      {skill.inputHints.length > 0 && (
        <Section title="Input Hints" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {skill.inputHints.map((h, i) => (
              <Chip key={i} label={h} size="small" variant="outlined" />
            ))}
          </Box>
        </Section>
      )}

      {skill.filePatterns.length > 0 && (
        <Section title="File Patterns" sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {skill.filePatterns.map((p, i) => (
              <Chip key={i} label={p} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
            ))}
          </Box>
        </Section>
      )}

      <Section title="Attachments" sx={{ mb: 3 }}>
        <AttachmentSection
          attachments={attachments}
          getUrl={(filename) => skillAttachmentUrl(projectId!, skillId!, filename)}
          onUpload={async (file) => {
            await uploadSkillAttachment(projectId!, skillId!, file);
            const atts = await listSkillAttachments(projectId!, skillId!);
            setAttachments(atts);
          }}
          onDelete={async (filename) => {
            await deleteSkillAttachment(projectId!, skillId!, filename);
            const atts = await listSkillAttachments(projectId!, skillId!);
            setAttachments(atts);
          }}
        />
      </Section>

      <Section title="Relations">
        <RelationManager
          projectId={projectId!}
          entityId={skillId!}
          entityType="skills"
          relations={relations}
          onRefresh={load}
        />
      </Section>

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete Skill"
        message={`Are you sure you want to delete "${skill.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(false)}
      />
    </Box>
  );
}
