import { formatDuration } from '@/lib/format'

// M0 placeholder. Replaced by the app shell and router in M2.
export default function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">Agency Tracker</h1>
      <p className="text-sm text-slate-500">
        Setup complete · sample time {formatDuration(19380)}
      </p>
    </main>
  )
}
