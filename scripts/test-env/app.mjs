// npm run test:app -- --as <email>: opens a test copy of the app (out-test/)
// against the running test environment, with its own profile, signed in as that
// account. Run it several times with different accounts to test side by side.
//   --as <email>     who to sign in as (omit to just open the sign-in screen)
//   --password <pw>  if it isn't the default test password
import { launch } from '../e2e/lib/cdp.mjs'
import { PASSWORD } from './server.mjs'
import { NEW_HIRE_PASSWORD, PEOPLE } from './seed.mjs'
import { addApp, profileDir, readState } from './state.mjs'

const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const state = readState()
if (!state) {
  console.error('No test environment is running. Start it first: npm run test:env')
  process.exit(1)
}

const email = arg('--as')
const person = PEOPLE.find((p) => p.email === email)
const password = arg('--password') ?? (person?.password === NEW_HIRE_PASSWORD ? NEW_HIRE_PASSWORD : PASSWORD)
const port = 9300 + ((state.apps?.length ?? 0) % 50)

const app = await launch({ port, userData: profileDir(email ?? 'signed-out'), keepAlive: true })
addApp({ pid: app.proc.pid, email: email ?? null })
if (email) {
  await app.login(email, password)
  const ok = await app.waitFor(`!document.querySelector('#email')`, 15000)
  console.log(ok ? `Signed in as ${email}.` : `Opened the app; sign-in as ${email} did not finish (check the window).`)
} else {
  console.log('Opened the test app on the sign-in screen.')
}
app.detach()
process.exit(0)
