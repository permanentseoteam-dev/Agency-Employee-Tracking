// Builds the app icons from the brand logo, build/logo-source.jpg:
//   build/icon.ico      16–256 px, the installer and the .exe
//   build/icon.png      256 px, the window and the tray
//   src/assets/logo.png 64 px, the logo inside the app
// It runs under Electron (npm run icon), whose nativeImage does the resizing, so
// no image library is needed. Clear ELECTRON_RUN_AS_NODE first if VS Code set it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { app, nativeImage } from 'electron'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE = join(ROOT, 'build', 'logo-source.jpg')

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(buf) {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/**
 * PNG bytes of the logo at `size` × `size` px, always 32-bit RGBA: Windows reads
 * icon frames as 32-bit, and nativeImage.toPNG() drops the alpha channel of an
 * opaque image (which made Explorer show garbage or a stale icon).
 */
function png(logo, size) {
  const bgra = logo.resize({ width: size, height: size, quality: 'best' }).toBitmap()
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1) // first byte of each row: filter none
    for (let x = 0; x < size; x++) {
      const s = (y * size + x) * 4
      const d = row + 1 + x * 4
      rows[d] = bgra[s + 2]
      rows[d + 1] = bgra[s + 1]
      rows[d + 2] = bgra[s]
      rows[d + 3] = bgra[s + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
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
