import { useTheme } from '@mui/material';
import MDEditor from '@uiw/react-md-editor';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: number;
}

export function MarkdownEditor({ value, onChange, height = 300 }: MarkdownEditorProps) {
  const { palette } = useTheme();
  const colorMode = palette.mode;

  return (
    <div data-color-mode={colorMode}>
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? '')}
        height={height}
        preview="edit"
        visibleDragbar={false}
      />
    </div>
  );
}
