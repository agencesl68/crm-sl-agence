import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import { ConfirmHost } from './components/Confirm'
import { ToastProvider } from './components/ui'
import { installSpotlight } from './lib/effects'
import { HOSTED } from './lib/env'
import './index.css'

installSpotlight()
// Dans la visionneuse claude.ai il n'y a pas de barre d'adresse : la navigation se fait en mémoire.
// Sur GitHub Pages, les adresses passent par le « # » pour qu'un rechargement retombe toujours sur l'application.
const Router = ({ children }: { children: ReactNode }) => (HOSTED ? <MemoryRouter>{children}</MemoryRouter> : import.meta.env.PROD ? <HashRouter>{children}</HashRouter> : <BrowserRouter>{children}</BrowserRouter>)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <ToastProvider>
        <App />
        <ConfirmHost />
      </ToastProvider>
    </Router>
  </StrictMode>,
)
