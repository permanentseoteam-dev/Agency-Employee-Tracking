// npm run office-setup: builds dist/office/PSEO-Tracker-Office-Setup-<version>.exe, one private
// file that joins a PC to the agency's Tailscale network and installs PSEO Tracker
// (scripts/staff-pc/setup-staff-pc.ps1, wrapped by office-setup.nsi).
//
// The Tailscale auth key comes from .env.office (TS_AUTHKEY=tskey-auth-…), which git ignores.
// It is built into the file, so never upload or share the result. The app installer is the
// existing dist/PSEO-Tracker-Setup-<version>.exe; this script doesn't build one.
//
// Options (for tests): --key-env <file> instead of .env.office, --out <folder> instead of dist/office.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i === -1 ? null : process.argv[i + 1]
}
const fail = (message) => {
  console.error(`\n  Office setup not built: ${message}\n`)
  process.exit(1)
}

// The auth key.
const envFile = arg('--key-env') ?? join(ROOT, '.env.office')
if (!existsSync(envFile)) fail(`${envFile} is missing. Put the Tailscale auth key in it as TS_AUTHKEY=tskey-auth-…`)
const keyLine = readFileSync(envFile, 'utf8').split(/\r?\n/).find((l) => l.trim().startsWith('TS_AUTHKEY='))
const key = keyLine ? keyLine.trim().slice('TS_AUTHKEY='.length).trim() : ''
if (!/^tskey-auth-[A-Za-z0-9_-]+$/.test(key)) fail(`${envFile} has no valid TS_AUTHKEY (it must start with tskey-auth-).`)

// The app installer: the one for package.json's version, else the newest.
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
const dist = join(ROOT, 'dist')
const installers = existsSync(dist)
  ? readdirSync(dist).filter((f) => /^PSEO-Tracker-Setup-.+\.exe$/.test(f)).sort((a, b) => statSync(join(dist, b)).mtimeMs - statSync(join(dist, a)).mtimeMs)
  : []
const installer = installers.includes(`PSEO-Tracker-Setup-${version}.exe`) ? `PSEO-Tracker-Setup-${version}.exe` : installers[0]
if (!installer) fail('there is no dist/PSEO-Tracker-Setup-<version>.exe. Build the app installer first.')
const appVersion = installer.match(/^PSEO-Tracker-Setup-(.+)\.exe$/)[1]

// Tailscale's installer: the copy in dist/staff-pc-setup, else downloaded (signed by Tailscale Inc.).
const kit = join(ROOT, 'dist', 'staff-pc-setup')
const msiName = existsSync(kit) ? readdirSync(kit).filter((f) => /^tailscale-setup-.+-amd64\.msi$/.test(f)).sort().pop() : null

// makensis, from electron-builder's cache (it downloads NSIS for the app installer).
const nsisCache = join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache')
const makensis = existsSync(nsisCache)
  ? readdirSync(nsisCache)
      .filter((d) => d.startsWith('nsis-') && !d.startsWith('nsis-resources'))
      .flatMap((d) => readdirSync(join(nsisCache, d)).map((sub) => join(nsisCache, d, sub, 'makensis.exe')))
      .find((p) => existsSync(p))
  : null
if (!makensis) fail('makensis.exe was not found in the electron-builder cache. Run npm run dist once to download it.')

const outDir = resolve(arg('--out') ?? join(ROOT, 'dist', 'office'))
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, `PSEO-Tracker-Office-Setup-${appVersion}.exe`)

const stage = mkdtempSync(join(tmpdir(), 'pseo-office-setup-'))
try {
  copyFileSync(join(ROOT, 'scripts', 'staff-pc', 'setup-staff-pc.ps1'), join(stage, 'setup-staff-pc.ps1'))
  copyFileSync(join(dist, installer), join(stage, installer))
  if (msiName) {
    copyFileSync(join(kit, msiName), join(stage, msiName))
  } else {
    console.log('Tailscale installer not in dist/staff-pc-setup: downloading it…')
    execFileSync('curl.exe', ['-sSL', '--fail', '--retry', '3', '-o', join(stage, 'tailscale-setup-latest-amd64.msi'), 'https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi'])
  }
  writeFileSync(join(stage, 'tailscale-key.txt'), key)

  execFileSync(
    makensis,
    [
      '-V2',
      `-DSTAGE=${stage}`,
      `-DOUTFILE=${outFile}`,
      `-DICON=${join(ROOT, 'build', 'icon.ico')}`,
      `-DVERSION=${appVersion}`,
      join(ROOT, 'scripts', 'office-setup', 'office-setup.nsi')
    ],
    { stdio: 'inherit' }
  )
} finally {
  rmSync(stage, { recursive: true, force: true })
}

const mb = (statSync(outFile).size / 1048576).toFixed(1)
console.log(`\nBuilt ${outFile} (${mb} MB)`)
console.log(`  app ${installer}, Tailscale ${msiName ?? 'latest (downloaded)'}, key ${key.slice(0, 11)}…`)
console.log('  It contains the Tailscale key: keep it private, never upload it to GitHub.')
