import { useState, useRef, useCallback } from 'react';
import {
  Box, Typography, IconButton, Tooltip, CircularProgress,
  ImageList, ImageListItem, ImageListItemBar,
  List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction,
  Alert, useTheme,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { ConfirmDialog } from '@/shared/ui/index.ts';

export interface AttachmentMeta {
  filename: string;
  mimeType: string;
  size: number;
  addedAt: number;
}

interface AttachmentSectionProps {
  attachments: AttachmentMeta[];
  getUrl: (filename: string) => string;
  onUpload: (file: File) => Promise<void>;
  onDelete: (filename: string) => Promise<void>;
  readOnly?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function AttachmentSection({ attachments, getUrl, onUpload, onDelete, readOnly }: AttachmentSectionProps) {
  const { palette } = useTheme();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        await onUpload(files[i]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [onUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await onDelete(deleteTarget);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget, onDelete]);

  const images = attachments.filter(a => isImage(a.mimeType));
  const files = attachments.filter(a => !isImage(a.mimeType));

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Image gallery */}
      {images.length > 0 && (
        <ImageList cols={3} gap={8} sx={{ mb: 2 }}>
          {images.map(img => (
            <ImageListItem key={img.filename} sx={{ borderRadius: 1, overflow: 'hidden', border: `1px solid ${palette.divider}` }}>
              <a href={getUrl(img.filename)} target="_blank" rel="noopener noreferrer">
                <img
                  src={getUrl(img.filename)}
                  alt={img.filename}
                  loading="lazy"
                  style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                />
              </a>
              <ImageListItemBar
                title={img.filename}
                subtitle={formatSize(img.size)}
                actionIcon={!readOnly ? (
                  <IconButton size="small" sx={{ color: 'white' }} onClick={() => setDeleteTarget(img.filename)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                ) : undefined}
              />
            </ImageListItem>
          ))}
        </ImageList>
      )}

      {/* File list */}
      {files.length > 0 && (
        <List dense sx={{ mb: 1 }}>
          {files.map(f => (
            <ListItem key={f.filename} sx={{ borderBottom: `1px solid ${palette.divider}` }}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <InsertDriveFileIcon fontSize="small" color="action" />
              </ListItemIcon>
              <ListItemText
                primary={f.filename}
                secondary={`${formatSize(f.size)} — ${f.mimeType}`}
                primaryTypographyProps={{ variant: 'body2' }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              <ListItemSecondaryAction>
                <Tooltip title="Download">
                  <IconButton size="small" href={getUrl(f.filename)} download={f.filename}>
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {!readOnly && (
                  <Tooltip title="Delete">
                    <IconButton size="small" onClick={() => setDeleteTarget(f.filename)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      {attachments.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          No attachments yet
        </Typography>
      )}

      {/* Upload zone */}
      {!readOnly && <Box
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        sx={{
          border: `2px dashed ${dragOver ? palette.primary.main : palette.divider}`,
          borderRadius: 1,
          p: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          bgcolor: dragOver ? (palette.mode === 'dark' ? 'rgba(144,202,249,0.08)' : 'rgba(25,118,210,0.04)') : 'transparent',
          transition: 'all 0.2s',
          cursor: 'pointer',
        }}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        {uploading ? (
          <CircularProgress size={20} />
        ) : (
          <>
            <UploadFileIcon color="action" fontSize="small" />
            <Typography variant="body2" color="text.secondary">
              Drop files here or click to upload
            </Typography>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={e => handleFiles(e.target.files)}
        />
      </Box>}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Attachment"
        message={`Are you sure you want to delete "${deleteTarget}"?`}
        confirmLabel="Delete"
        confirmColor="error"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Box>
  );
}
