import { TextField, type TextFieldProps } from '@mui/material'
import { FieldLabel } from './FieldLabel.tsx'

type AppTextFieldProps = Omit<TextFieldProps, 'label'> & {
  fieldLabel?: string
  required?: boolean
}

/**
 * Unified text field: always renders FieldLabel above, never MUI's built-in label.
 */
export function AppTextField({ fieldLabel, required, ...rest }: AppTextFieldProps) {
  return (
    <>
      {fieldLabel && <FieldLabel required={required}>{fieldLabel}</FieldLabel>}
      <TextField {...rest} />
    </>
  )
}
