// Tray icon and menu (plan §4.1): Open, today's time, status, and Quit for
// managers and admins only. The icon is the logo with a dot for the tracker state.
import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import trayLogo from '../../build/icon.png?asset'
import type { TrackerStatus } from '../preload/api'
import { trayModel, type Tone } from './trayMenu'

const COLORS: Record<Tone, [number, number, number]> = {
  active: [22, 163, 74], // green-600
  idle: [245, 158, 11], // amber-500
  off: [100, 116, 139], // slate-500
  signedOut: [220, 38, 38] // red-600
}

/**
 * The logo as a 32×32 bitmap (16 px at 2×) with an anti-aliased status dot, white
 * rim included, in the bottom-right corner, blended over the logo.
 */
function logoWithDot([r, g, b]: [number, number, number]): NativeImage {
  const size = 32
  const buf = Buffer.from(
    nativeImage.createFromPath(trayLogo).resize({ width: size, height: size, quality: 'best' }).toBitmap()
  )
  const c = 24.5
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  for (let y = 16; y < size; y++) {
    for (let x = 16; x < size; x++) {
      const dist = Math.hypot(x - c, y - c)
      const outer = clamp(7.5 - dist) // coverage of the whole disc
      if (outer === 0) continue
      const inner = clamp(5.5 - dist) // coverage of the coloured centre
      const i = (y * size + x) * 4
      // BGRA, premultiplied: the dot (white rim around the colour) over the logo.
      const over = (dot: number, base: number) => Math.round(dot * inner + 255 * (outer - inner) + base * (1 - outer))
      buf[i] = over(b, buf[i])
      buf[i + 1] = over(g, buf[i + 1])
      buf[i + 2] = over(r, buf[i + 2])
      buf[i + 3] = Math.round(255 * outer + buf[i + 3] * (1 - outer))
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
}

const icons = new Map<Tone, NativeImage>()
function icon(tone: Tone): NativeImage {
  if (!icons.has(tone)) icons.set(tone, logoWithDot(COLORS[tone]))
  return icons.get(tone)!
}

export function createTray(handlers: { open(): void; quit(): void }): (s: TrackerStatus) => void {
  const tray = new Tray(icon('off'))
  tray.setToolTip('PSEO Tracker')
  tray.on('click', handlers.open)
  tray.on('double-click', handlers.open)

  let lastMenu = ''
  let lastTone: Tone = 'off'
  return (s) => {
    const m = trayModel(s)
    if (m.tone !== lastTone) {
      tray.setImage(icon(m.tone))
      lastTone = m.tone
    }
    tray.setToolTip(`PSEO Tracker ${app.getVersion()} – ${m.status}\n${m.today}`)

    const key = JSON.stringify(m)
    if (key === lastMenu) return
    lastMenu = key
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open PSEO Tracker', click: handlers.open },
        { type: 'separator' },
        { label: m.today, enabled: false },
        { label: m.status, enabled: false },
        ...(m.pending ? [{ label: m.pending, enabled: false }] : []),
        ...(m.canQuit ? [{ type: 'separator' as const }, { label: 'Quit', click: handlers.quit }] : [])
      ])
    )
  }
}
