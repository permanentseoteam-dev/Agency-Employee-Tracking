// Where a running test environment keeps its bookkeeping: the database URL and
// PID, and the PIDs of test apps opened with npm run test:app (so Ctrl+C in
// test:env can close them). Everything lives in the system temp folder.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const HOME = join(tmpdir(), 'pseo-test-env')
const FILE = join(HOME, 'state.json')

export function readState() {
  return existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null
}

export function writeState(state) {
  mkdirSync(HOME, { recursive: true })
  writeFileSync(FILE, JSON.stringify(state, null, 2))
}

export function addApp(app) {
  const s = readState()
  if (!s) return
  s.apps = [...(s.apps ?? []), app]
  writeState(s)
}

export function clearState() {
  try {
    rmSync(HOME, { recursive: true, force: true })
  } catch {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Stops whatever a previous test environment left running, by PID only: its test
 * apps, its database and its own process. Then deletes its temp folders.
 */
export async function stopRecorded(state, { exceptPid } = {}) {
  if (!state) return
  for (const pid of [...(state.apps ?? []).map((a) => a.pid), state.pid, state.envPid]) {
    if (!pid || pid === exceptPid) continue
    try {
      process.kill(pid)
    } catch {}
  }
  await sleep(800) // let Windows release the database files
  if (state.dataDir) {
    try {
      rmSync(state.dataDir, { recursive: true, force: true })
    } catch {}
  }
  clearState()
}

/** A test app's own profile folder (one per account, so several can run side by side). */
export function profileDir(email) {
  return join(HOME, 'profiles', email.replace(/[^a-z0-9]+/gi, '_'))
}
