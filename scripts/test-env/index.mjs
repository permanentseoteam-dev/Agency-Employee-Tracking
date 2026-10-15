// npm run test:env: a throwaway test database (127.0.0.1:8099) filled with a test
// company, plus a test build of the app pointed at it. Real data (port 8090,
// server\pb_data) and the app in out/ are never touched. Ctrl+C stops everything.
//   npm run test:env              start (builds the test app if the code changed)
//   npm run test:env -- --rebuild force a fresh test build
//   npm run test:env -- --stop    stop a test environment whose window is gone
import { PASSWORD, startTestServer } from './server.mjs'
import { NEW_HIRE_PASSWORD, PEOPLE, seed } from './seed.mjs'
import { seedExtras } from './seed-extras.mjs'
import { ensureTestBuild } from './build.mjs'
import { clearState, readState, stopRecorded, writeState } from './state.mjs'

// A leftover from a run that did not shut down cleanly (or --stop): close it first.
const previous = readState()
if (previous) await stopRecorded(previous, { exceptPid: process.pid })
if (process.argv.includes('--stop')) {
  console.log(previous ? 'Stopped the test environment.' : 'No test environment was running.')
  process.exit(0)
}

console.log('Starting the PSEO Tracker test environment…')
const server = await startTestServer()
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  console.log('\nStopping the test environment…')
  for (const a of readState()?.apps ?? []) {
    try {
      process.kill(a.pid)
    } catch {}
  }
  await server.stop()
  clearState()
  console.log('Stopped. The test database and test profiles were deleted.')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)

try {
  const info = await seed(server.api, { log: (m) => console.log('  seed ' + m) })
  await seedExtras(server.api, info, { log: (m) => console.log('  seed ' + m) })
  writeState({ url: server.url, pid: server.pid, envPid: process.pid, dataDir: server.dataDir, today: info.today, apps: [] })
  ensureTestBuild(server.url, { force: process.argv.includes('--rebuild'), log: (m) => console.log('  ' + m) })
} catch (err) {
  console.error('Setup failed:', err.message)
  await stop()
}

console.log(`
Test database: ${server.url}   (dashboard: ${server.url}/_/  superuser root@test.local / ${PASSWORD})

Test accounts (password ${PASSWORD} unless shown):`)
console.table(
  PEOPLE.map((p) => ({
    role: p.inactive ? 'employee (left)' : p.role,
    name: p.name,
    email: p.email,
    password: p.password === NEW_HIRE_PASSWORD ? NEW_HIRE_PASSWORD : '',
    team: p.team ?? '',
    note: p.note ?? ''
  }))
)
console.log(`Open a test app signed in as someone (several can run side by side):
  npm run test:app -- --as asma@test.local
  npm run test:app -- --as bilal@test.local
  npm run test:app -- --as admin@test.local

Leave this window open while testing. Press Ctrl+C to stop and delete everything.`)
await new Promise(() => {})
