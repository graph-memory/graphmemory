import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Alert, CircularProgress, Link, Stack, useTheme,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { getFileInfo, type FileInfo } from '@/entities/file/index.ts';
import { findLinkedNotes } from '@/entities/note/index.ts';
import { findLinkedTasks } from '@/entities/task/index.ts';
import { PageTopBar, Section, FieldRow, CopyButton, StatusBadge, DetailLayout } from '@/shared/ui/index.ts';
import { useProjectDir } from '@/shared/lib/useProjectDir.ts';
import { STATUS_BADGE_COLOR, statusLabel } from '@/entities/task/index.ts';
import type { TaskStatus } from '@/entities/task/index.ts';

interface LinkedNote {
  noteId: string;
  title: string;
  kind: string;
  tags: string[];
}

interface LinkedTask {
  taskId: string;
  title: string;
  kind: string;
  status: string;
  priority: string;
  tags: string[];
}

function formatSize(bytes?: number) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileDetailPage() {
  const { projectId, '*': filePath } = useParams<{ projectId: string; '*': string }>();
  const navigate = useNavigate();
  const { palette } = useTheme();
  const [file, setFile] = useState<FileInfo | null>(null);
  const projectDir = useProjectDir(projectId);
  const [linkedNotes, setLinkedNotes] = useState<LinkedNote[]>([]);
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !filePath) return;
    setLoading(true);
    Promise.all([
      getFileInfo(projectId, filePath),
      findLinkedNotes(projectId, 'files', filePath).catch(() => []),
      findLinkedTasks(projectId, 'files', filePath).catch(() => []),
    ])
      .then(([f, notes, tasks]) => {
        setFile(f);
        setLinkedNotes(notes as LinkedNote[]);
        setLinkedTasks(tasks as LinkedTask[]);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [projectId, filePath]);

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  }

  if (error || !file) {
    return <Alert severity="error">{error || 'File not found'}</Alert>;
  }

  const parentDir = filePath!.split('/').slice(0, -1).join('/') || '.';

  return (
    <Box>
      <PageTopBar
        breadcrumbs={[
          { label: 'Files', to: `/${projectId}/files` },
          { label: file.fileName },
        ]}
      />

      <DetailLayout
        main={
          <>
            <Section title="Linked Notes" sx={{ mb: 3 }}>
              {linkedNotes.length === 0 ? (
                <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>No linked notes</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {linkedNotes.map(note => (
                    <Box key={note.noteId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StatusBadge label={note.kind} color="neutral" size="small" />
                      <Link component="button" variant="body2" onClick={() => navigate(`/${projectId}/knowledge/${note.noteId}`)}>
                        {note.title}
                      </Link>
                    </Box>
                  ))}
                </Stack>
              )}
            </Section>

            <Section title="Linked Tasks">
              {linkedTasks.length === 0 ? (
                <Typography variant="body2" sx={{ color: palette.custom.textMuted }}>No linked tasks</Typography>
              ) : (
                <Stack spacing={0.5}>
                  {linkedTasks.map(task => (
                    <Box key={task.taskId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StatusBadge label={statusLabel(task.status as TaskStatus)} color={STATUS_BADGE_COLOR[task.status as TaskStatus] ?? 'neutral'} size="small" />
                      <Link component="button" variant="body2" onClick={() => navigate(`/${projectId}/tasks/${task.taskId}`)}>
                        {task.title}
                      </Link>
                    </Box>
                  ))}
                </Stack>
              )}
            </Section>
          </>
        }
        sidebar={
          <Section title="Metadata">
            <FieldRow label="Path">
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{file.filePath}</Typography>
                <CopyButton value={file.filePath} />
                {projectDir && (
                  <Link
                    href={`vscode://file/${projectDir}/${file.filePath}`}
                    sx={{ display: 'inline-flex', color: palette.custom.textMuted }}
                    title="Open in VS Code"
                  >
                    <OpenInNewIcon sx={{ fontSize: 14 }} />
                  </Link>
                )}
              </Box>
            </FieldRow>
            <FieldRow label="Size">
              <Typography variant="body2">{formatSize(file.size)}</Typography>
            </FieldRow>
            {file.language && (
              <FieldRow label="Language">
                <Typography variant="body2">{file.language}</Typography>
              </FieldRow>
            )}
            {file.mimeType && (
              <FieldRow label="MIME Type">
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{file.mimeType}</Typography>
              </FieldRow>
            )}
            {file.extension && (
              <FieldRow label="Extension">
                <Typography variant="body2">{file.extension}</Typography>
              </FieldRow>
            )}
            <FieldRow label="Directory" divider={false}>
              <Link component="button" variant="body2" onClick={() => navigate(`/${projectId}/files?dir=${parentDir}`)}>
                {parentDir}
              </Link>
            </FieldRow>
          </Section>
        }
      />
    </Box>
  );
}
