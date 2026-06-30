import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './design/global.css'
import { App } from './app/App'

if (import.meta.env.DEV) {
  void import('./data/devtools').then((m) => m.installDevtools())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
