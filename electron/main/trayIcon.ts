// Draws the tray icon's pixels: the logo with a status dot in the bottom-right
// corner. Pure (no Electron), so the drawing is tested.

/** The tray bitmap is 32×32 px (16 px at 2×). */
export const TRAY_SIZE = 32

/**
 * A BGRA, premultiplied bitmap of TRAY_SIZE² px: `logo` (same format and size)
 * with an anti-aliased dot, white rim included, blended over its corner. With no
 * logo, or one of the wrong size, the dot is drawn alone on a transparent tile.
 */
export function withStatusDot(logo: Uint8Array | null, [r, g, b]: [number, number, number]): Buffer {
  const size = TRAY_SIZE
  const buf = logo && logo.length === size * size * 4 ? Buffer.from(logo) : Buffer.alloc(size * size * 4)
  const c = 24.5
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  for (let y = 16; y < size; y++) {
    for (let x = 16; x < size; x++) {
      const dist = Math.hypot(x - c, y - c)
      const outer = clamp(7.5 - dist) // coverage of the whole disc
      if (outer === 0) continue
      const inner = clamp(5.5 - dist) // coverage of the coloured centre
      const i = (y * size + x) * 4
      const over = (dot: number, base: number) => Math.round(dot * inner + 255 * (outer - inner) + base * (1 - outer))
      buf[i] = over(b, buf[i])
      buf[i + 1] = over(g, buf[i + 1])
      buf[i + 2] = over(r, buf[i + 2])
      buf[i + 3] = Math.round(255 * outer + buf[i + 3] * (1 - outer))
    }
  }
  return buf
}
