// A throwaway PocketBase for tests: its own temp data folder, the repo's
// migrations and hooks, a test superuser. Never port 8090 or server\pb_data.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ROOT } from '../e2e/lib/cdp.mjs'

export const TEST_PORT = 8099
export const PASSWORD = 'Test-pass-123'
export const SUPERUSER = 'root@test.local'
const EXE = join(ROOT, 'server', 'pocketbase.exe')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function listening(url) {
  try {
    return (await fetch(`${url}/api/health`)).ok
  } catch {
    return false
  }
}

/** Starts the test database and returns { url, dataDir, api, stop }. */
export async function startTestServer({ port = TEST_PORT } = {}) {
  const url = `http://127.0.0.1:${port}`
  if (await listening(url)) throw new Error(`port ${port} is already in use: stop the other test setup first`)
  const dataDir = mkdtempSync(join(tmpdir(), 'pseo-test-db-'))
  const common = ['--dir', dataDir, '--migrationsDir', join(ROOT, 'server', 'pb_migrations'), '--hooksDir', join(ROOT, 'server', 'pb_hooks')]
  execFileSync(EXE, ['migrate', 'up', ...common], { stdio: 'ignore' })
  execFileSync(EXE, ['superuser', 'upsert', SUPERUSER, PASSWORD, ...common], { stdio: 'ignore' })
  const proc = spawn(EXE, ['serve', '--http', `127.0.0.1:${port}`, ...common], { stdio: 'ignore' })
  for (let i = 0; i < 60 && !(await listening(url)); i++) await sleep(200)
  if (!(await listening(url))) {
    proc.kill()
    throw new Error('the test database did not start')
  }

  const api = makeApi(url)
  await api.signInSuperuser()

  return {
    url,
    dataDir,
    pid: proc.pid,
    api,
    async stop() {
      proc.kill()
      for (let i = 0; i < 25 && (await listening(url)); i++) await sleep(200)
      await sleep(300) // let Windows release the database files
      try {
        rmSync(dataDir, { recursive: true, force: true })
      } catch {}
    }
  }
}

/** A tiny REST client: `as` = a token, or omitted for the superuser. */
export function makeApi(url) {
  let rootToken = ''
  async function call(method, path, body, token) {
    const r = await fetch(url + path, {
      method,
      headers: { 'content-type': 'application/json', Authorization: token ?? rootToken },
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await r.text()
    const data = text ? JSON.parse(text) : null
    if (!r.ok) throw Object.assign(new Error(`${method} ${path} → ${r.status} ${text}`), { status: r.status, data })
    return data
  }
  return {
    url,
    call,
    async signInSuperuser() {
      rootToken = (await call('POST', '/api/collections/_superusers/auth-with-password', { identity: SUPERUSER, password: PASSWORD }, '')).token
    },
    /** Signs in an app user and returns their token. */
    async tokenOf(email, password = PASSWORD) {
      return (await call('POST', '/api/collections/users/auth-with-password', { identity: email, password }, '')).token
    },
    create: (collection, body, token) => call('POST', `/api/collections/${collection}/records`, body, token),
    update: (collection, id, body, token) => call('PATCH', `/api/collections/${collection}/records/${id}`, body, token),
    list: async (collection, filter = '', token) =>
      (await call('GET', `/api/collections/${collection}/records?perPage=500${filter ? '&filter=' + encodeURIComponent(filter) : ''}`, null, token)).items,
    /** Many creates in few requests (PocketBase batch API, enabled by the seed). */
    async batchCreate(collection, bodies) {
      for (let i = 0; i < bodies.length; i += 100) {
        const requests = bodies.slice(i, i + 100).map((body) => ({ method: 'POST', url: `/api/collections/${collection}/records`, body }))
        await call('POST', '/api/batch', { requests })
      }
    }
  }
}
