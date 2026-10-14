import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

window.addEventListener('error', (event) => window.tracker?.logError(event.message))
window.addEventListener('unhandledrejection', (event) =>
  window.tracker?.logError(String(event.reason))
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
