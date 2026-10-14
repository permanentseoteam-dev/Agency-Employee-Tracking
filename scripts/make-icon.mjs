// Builds the app icons from the brand logo, build/logo-source.jpg:
//   build/icon.ico      16–256 px, the installer and the .exe
//   build/icon.png      256 px, the window and the tray
//   src/assets/logo.png 64 px, the logo inside the app
// It runs under Electron (npm run icon), whose nativeImage does the resizing, so
// no image library is needed. Clear ELECTRON_RUN_AS_NODE first if VS Code set it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { app, nativeImage } from 'electron'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE = join(ROOT, 'build', 'logo-source.jpg')

/** PNG bytes of the logo at `size` × `size` px. */
function png(logo, size) {
  return logo.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

/** An .ico holding PNG images (supported since Windows Vista). */
function ico(logo, sizes) {
  const images = sizes.map((size) => png(logo, size))
  const header = Buffer.alloc(6 + 16 * sizes.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(sizes.length, 4)
  let offset = header.length
  sizes.forEach((size, n) => {
    const e = 6 + 16 * n
    header[e] = size >= 256 ? 0 : size
    header[e + 1] = size >= 256 ? 0 : size
    header.writeUInt16LE(1, e + 4) // colour planes
    header.writeUInt16LE(32, e + 6) // bits per pixel
    header.writeUInt32LE(images[n].length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += images[n].length
  })
  return Buffer.concat([header, ...images])
}

// Keep Electron's own profile out of %APPDATA%.
app.setPath('userData', join(tmpdir(), 'pseo-tracker-icon-build'))

app.whenReady().then(() => {
  const logo = nativeImage.createFromPath(SOURCE)
  if (logo.isEmpty()) {
    console.error(`Could not read ${SOURCE}`)
    app.exit(1)
    return
  }
  mkdirSync(join(ROOT, 'src', 'assets'), { recursive: true })
  writeFileSync(join(ROOT, 'build', 'icon.ico'), ico(logo, [16, 24, 32, 48, 64, 128, 256]))
  writeFileSync(join(ROOT, 'build', 'icon.png'), png(logo, 256))
  writeFileSync(join(ROOT, 'src', 'assets', 'logo.png'), png(logo, 64))
  console.log('wrote build/icon.ico, build/icon.png and src/assets/logo.png')
  app.quit()
})
