// Stops a release build that would point staff at the wrong server.
// The server address is baked in at build time from VITE_PB_URL
// (the environment, or .env.production). Usage: run before electron-builder.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = resolve(import.meta.dirname, '..', '.env.production')
let url = process.env.VITE_PB_URL ?? ''
if (!url && existsSync(file)) {
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith('VITE_PB_URL='))
  url = line ? line.slice('VITE_PB_URL='.length).trim() : ''
}

const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i
const rawIp = /^https?:\/\/\d+\.\d+\.\d+\.\d+(:|\/|$)/
let problem = ''
if (!url) problem = 'VITE_PB_URL is not set. Copy .env.production.example to .env.production and fill in the server address.'
else if (local.test(url) && process.env.ALLOW_LOCAL_PB_URL !== '1') problem = `VITE_PB_URL is ${url}: staff PCs can't reach a local address.`
else if (rawIp.test(url) && process.env.ALLOW_LOCAL_PB_URL !== '1') problem = `VITE_PB_URL is a raw IP (${url}). Use the server's Tailscale machine name instead, e.g. http://agency-server:8090.`

if (problem) {
  console.error(`\n  Release stopped: ${problem}\n`)
  process.exit(1)
}
console.log(`Release build will use the server at ${url}`)
