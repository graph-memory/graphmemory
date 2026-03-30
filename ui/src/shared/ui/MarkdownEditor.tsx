import { lazy, Suspense } from 'react';
import { useTheme, CircularProgress, Box } from '@mui/material';
import rehypeSanitize from 'rehype-sanitize';

const MDEditor = lazy(() => import('@uiw/react-md-editor'));

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
}

export function MarkdownEditor({ value, onChange, height = 400 }: MarkdownEditorProps) {
  const { palette } = useTheme();
  const colorMode = palette.mode;

  return (
    <div data-color-mode={colorMode}>
      <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height }}><CircularProgress size={24} /></Box>}>
        <MDEditor
          value={value}
          onChange={(v) => onChange(v ?? '')}
          height={height}
          preview="edit"
          visibleDragbar={false}
          previewOptions={{
            rehypePlugins: [[rehypeSanitize]],
          }}
        />
      </Suspense>
    </div>
  );
}
