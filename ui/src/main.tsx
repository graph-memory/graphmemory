import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeModeProvider } from '@/shared/lib/ThemeModeContext.tsx'
import AuthGate from '@/shared/lib/AuthGate.tsx'
import App from '@/app/App.tsx'
import '@/app/styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ui">
      <ThemeModeProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </ThemeModeProvider>
    </BrowserRouter>
  </StrictMode>,
)
