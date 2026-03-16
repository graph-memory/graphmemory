import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react'
import { ThemeProvider, CssBaseline } from '@mui/material'
import { darkTheme, lightTheme } from '@/app/theme.ts'

type ThemeMode = 'light' | 'dark'

interface ThemeModeContextValue {
  mode: ThemeMode
  toggle: () => void
}

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: 'dark',
  toggle: () => {},
})

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem('theme-mode')
    return stored === 'light' ? 'light' : 'dark'
  })

  const toggle = useCallback(() => {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('theme-mode', next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ mode, toggle }), [mode, toggle])
  const theme = mode === 'dark' ? darkTheme : lightTheme

  return (
    <ThemeModeContext value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext>
  )
}

export function useThemeMode() {
  return useContext(ThemeModeContext)
}
