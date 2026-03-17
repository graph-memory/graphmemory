import { createTheme } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Palette {
    custom: {
      surface: string
      surfaceMuted: string
      border: string
      textMuted: string
      textOnPrimary: string
      neutral: string
    }
  }
  interface PaletteOptions {
    custom?: {
      surface?: string
      surfaceMuted?: string
      border?: string
      textMuted?: string
      textOnPrimary?: string
      neutral?: string
    }
  }
}

const typography = {
  fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
}

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#569cd6' },
    secondary: { main: '#c586c0' },
    success: { main: '#6a9955' },
    error: { main: '#f14c4c' },
    warning: { main: '#cca700' },
    info: { main: '#3794ff' },
    background: {
      default: '#1e1e1e',
      paper: '#252526',
    },
    text: {
      primary: '#cccccc',
      secondary: '#9d9d9d',
    },
    divider: '#3c3c3c',
    action: {
      hover: 'rgba(90,93,94,0.31)',
      selected: 'rgba(90,93,94,0.40)',
      focus: 'rgba(90,93,94,0.48)',
    },
    custom: {
      surface: '#252526',
      surfaceMuted: '#2d2d2d',
      border: '#3c3c3c',
      textMuted: '#858585',
      textOnPrimary: '#ffffff',
      neutral: '#858585',
    },
  },
  typography,
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#1e1e1e' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-track': { background: '#1e1e1e' },
        '*::-webkit-scrollbar-thumb': { background: '#424242', borderRadius: 0 },
        '*::-webkit-scrollbar-thumb:hover': { background: '#4f4f4f' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#181818',
          borderRight: '1px solid #2b2b2b',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: '#181818', boxShadow: 'none', borderBottom: '1px solid #2b2b2b' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { backgroundColor: '#252526', border: '1px solid #3c3c3c' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { '& .MuiTableCell-head': { backgroundColor: '#2d2d2d', color: '#cccccc' } },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: '1px solid #3c3c3c' },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { backgroundColor: '#2d2d2d', border: '1px solid #3c3c3c' },
      },
    },
    MuiButton: {
      styleOverrides: {
        contained: { boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
        containedPrimary: { backgroundColor: '#0e639c', '&:hover': { backgroundColor: '#1177bb' } },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: '#3c3c3c',
            '& fieldset': { borderColor: '#3c3c3c' },
            '&:hover fieldset': { borderColor: '#569cd6' },
            '&.Mui-focused fieldset': { borderColor: '#569cd6' },
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: '#3c3c3c',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3c3c3c' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#569cd6' },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: { '&.Mui-selected': { backgroundColor: 'rgba(90,93,94,0.40)' } },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', color: '#969696', '&.Mui-selected': { color: '#ffffff' } },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#383838', border: '1px solid #454545', color: '#cccccc' },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { backgroundColor: '#2d2d2d', border: '1px solid #454545' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { backgroundColor: '#252526', border: '1px solid #454545' },
      },
    },
  },
})

export const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    secondary: { main: '#9c27b0' },
    success: { main: '#2e7d32' },
    error: { main: '#d32f2f' },
    warning: { main: '#ed6c02' },
    background: {
      default: '#f0f2f5',
      paper: '#ffffff',
    },
    custom: {
      surface: '#ffffff',
      surfaceMuted: '#f5f5f5',
      border: '#e0e0e0',
      textMuted: '#757575',
      textOnPrimary: '#ffffff',
      neutral: '#9e9e9e',
    },
  },
  typography,
  components: {
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: '0.8125rem',
          textTransform: 'uppercase' as const,
          letterSpacing: '0.04em',
          fontWeight: 500,
          '&.MuiInputLabel-shrink': {
            transform: 'translate(14px, -9px) scale(0.85)',
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e0e0e0',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundColor: '#ffffff', boxShadow: 'none', borderBottom: '1px solid #e0e0e0' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { backgroundColor: '#ffffff', border: '1px solid #e0e0e0' },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: { '& .MuiTableCell-head': { backgroundColor: '#f5f5f5' } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { backgroundColor: '#f5f5f5', border: '1px solid #e0e0e0' },
      },
    },
  },
})
