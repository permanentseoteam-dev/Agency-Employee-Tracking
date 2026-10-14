// Builds the test copy of the app into out-test/, pointed at the test database.
// out/ (what the desktop shortcut runs) is never touched.
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from '../e2e/lib/cdp.mjs'

const STAMP = join(ROOT, 'out-test', '.build-stamp')
const SOURCES = ['src', 'electron', 'build', 'index.html', 'package.json', 'electron.vite.config.ts']

function newest(path) {
  const full = join(ROOT, path)
  if (!existsSync(full)) return 0
  const s = statSync(full)
  if (!s.isDirectory()) return s.mtimeMs
  let max = s.mtimeMs
  for (const entry of readdirSync(full)) max = Math.max(max, newest(join(path, entry)))
  return max
}

/** Builds when the sources changed since the last test build (or for another server URL). */
export function ensureTestBuild(pbUrl, { force = false, log = console.log } = {}) {
  const stamp = existsSync(STAMP) ? JSON.parse(readFileSync(STAMP, 'utf8')) : null
  const changed = Math.max(...SOURCES.map(newest))
  if (!force && stamp && stamp.pbUrl === pbUrl && stamp.builtAt >= changed && existsSync(join(ROOT, 'out-test', 'main', 'index.js'))) {
    log('test app: up to date (out-test/)')
    return
  }
  log('test app: building into out-test/ …')
  const env = { ...process.env, VITE_PB_URL: pbUrl }
  execSync('npx electron-vite build --outDir out-test', { cwd: ROOT, env, stdio: 'ignore' })
  writeFileSync(STAMP, JSON.stringify({ pbUrl, builtAt: Date.now() }))
  log('test app: built')
}
