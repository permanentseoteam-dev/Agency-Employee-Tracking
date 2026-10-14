// Draws the app icon (an indigo tile with a white stopwatch) and writes
// build/icon.png (512 px) and build/icon.ico (16–256 px). Run: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const OUT = resolve(import.meta.dirname, '..', 'build')
const INDIGO = [79, 70, 229] // indigo-600, the app's accent

// Coverage (0–1) of a shape at a pixel, from a signed distance in pixels (negative = inside).
const cover = (d) => Math.min(1, Math.max(0, 0.5 - d))

function roundedBox(x, y, half, radius) {
  const qx = Math.abs(x) - half + radius
  const qy = Math.abs(y) - half + radius
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
}

function segment(px, py, ax, ay, bx, by, width) {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy) - width / 2
}

/** RGBA pixels of the icon at `size` px, drawn in a 0–1 coordinate space. */
function draw(size) {
  const px = new Uint8Array(size * size * 4)
  const s = size
  for (let j = 0; j < s; j++) {
    for (let i = 0; i < s; i++) {
      const x = (i + 0.5) / s - 0.5
      const y = (j + 0.5) / s - 0.5
      const tile = cover(roundedBox(x, y, 0.47, 0.11) * s)
      // Stopwatch: ring, crown on top, and a hand pointing to two o'clock.
      const cx = x
      const cy = y - 0.04
      const ring = Math.abs(Math.hypot(cx, cy) - 0.255) - 0.045
      const crown = Math.min(roundedBox(cx, cy + 0.335, 0.055, 0.02), segment(cx, cy, 0, -0.3, 0, -0.27, 0.06))
      const hand = Math.min(segment(cx, cy, 0, 0, 0.11, -0.11, 0.065), Math.hypot(cx, cy) - 0.05)
      const white = cover(Math.min(ring, crown, hand) * s)
      const k = (j * s + i) * 4
      px[k] = Math.round(INDIGO[0] * (1 - white) + 255 * white)
      px[k + 1] = Math.round(INDIGO[1] * (1 - white) + 255 * white)
      px[k + 2] = Math.round(INDIGO[2] * (1 - white) + 255 * white)
      px[k + 3] = Math.round(255 * Math.max(tile, white * tile))
    }
  }
  return px
}

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
function png(size) {
  const rgba = draw(size)
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0 // filter: none
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(rows, y * (size * 4 + 1) + 1)
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
function ico(sizes) {
  const images = sizes.map(png)
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

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'icon.png'), png(512))
writeFileSync(join(OUT, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]))
console.log('wrote build/icon.png and build/icon.ico')
