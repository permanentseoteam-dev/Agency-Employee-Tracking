import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './stores/theme' // applies the saved theme before first paint
import './index.css'

window.addEventListener('error', (event) => window.tracker?.logError(event.message))
window.addEventListener('unhandledrejection', (event) =>
  window.tracker?.logError(String(event.reason))
)

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
