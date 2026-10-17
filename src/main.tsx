import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { AppError } from './lib/db'
import { isPreviewing } from './stores/rolePreview'
import './stores/theme' // applies the saved theme before first paint
import './index.css'

window.addEventListener('error', (event) => window.tracker?.logError(event.message))
window.addEventListener('unhandledrejection', (event) =>
  window.tracker?.logError(String(event.reason))
)

const queryClient = new QueryClient({
  // Previewing another role (Admin chip) is look-only: every save, apply, approve and delete stops here.
  mutationCache: new MutationCache({
    onMutate: () => {
      if (isPreviewing()) throw new AppError(403, 'This is a preview, so changes are switched off. Go back to Admin to make changes.')
    }
  }),
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
