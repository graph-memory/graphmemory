import { useRef, useState } from 'react';
import {
  Box, Typography, IconButton, List, ListItem, ListItemText, ListItemSecondaryAction,
  useTheme,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DeleteIcon from '@mui/icons-material/Delete';

interface StagedAttachmentsProps {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function StagedAttachments({ files, onAdd, onRemove }: StagedAttachmentsProps) {
  const { palette } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      onAdd(Array.from(e.dataTransfer.files));
    }
  };

  const handleFiles = (fileList: FileList | null) => {
    if (fileList && fileList.length > 0) {
      onAdd(Array.from(fileList));
    }
  };

  return (
    <Box>
      {files.length > 0 && (
        <List dense disablePadding sx={{ mb: 1 }}>
          {files.map((file, i) => (
            <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
              <ListItemText
                primary={file.name}
                secondary={formatSize(file.size)}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              <ListItemSecondaryAction>
                <IconButton size="small" onClick={() => onRemove(i)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
      )}

      <Box
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
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
      >
        <UploadFileIcon color="action" fontSize="small" />
        <Typography variant="body2" color="text.secondary">
          Drop files here or click to add
        </Typography>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
        />
      </Box>
    </Box>
  );
}
