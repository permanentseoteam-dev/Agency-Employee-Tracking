// Tray icon and menu (plan §4.1): Open, today's time, status, and Quit for
// managers and admins only. The icon colour follows the tracker state.
import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import type { TrackerStatus } from '../preload/api'
import { trayModel, type Tone } from './trayMenu'

const COLORS: Record<Tone, [number, number, number]> = {
  active: [22, 163, 74], // green-600
  idle: [245, 158, 11], // amber-500
  off: [100, 116, 139], // slate-500
  signedOut: [220, 38, 38] // red-600
}

/** A filled, anti-aliased dot with a white rim, drawn as a 32×32 bitmap (16 px at 2×). */
function dot([r, g, b]: [number, number, number]): NativeImage {
  const size = 32
  const buf = Buffer.alloc(size * size * 4)
  const c = (size - 1) / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - c, y - c)
      const outer = Math.min(1, Math.max(0, 14.5 - dist)) // coverage of the whole disc
      const inner = Math.min(1, Math.max(0, 12 - dist)) // coverage of the coloured centre
      const i = (y * size + x) * 4
      // BGRA, premultiplied: white rim blended with the colour inside.
      const mix = (v: number) => Math.round(v * inner + 255 * (outer - inner))
      buf[i] = mix(b)
      buf[i + 1] = mix(g)
      buf[i + 2] = mix(r)
      buf[i + 3] = Math.round(255 * outer)
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 })
}

const icons = new Map<Tone, NativeImage>()
function icon(tone: Tone): NativeImage {
  if (!icons.has(tone)) icons.set(tone, dot(COLORS[tone]))
  return icons.get(tone)!
}

export function createTray(handlers: { open(): void; quit(): void }): (s: TrackerStatus) => void {
  const tray = new Tray(icon('off'))
  tray.setToolTip('Agency Tracker')
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
    tray.setToolTip(`Agency Tracker ${app.getVersion()} – ${m.status}\n${m.today}`)

    const key = JSON.stringify(m)
    if (key === lastMenu) return
    lastMenu = key
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open Agency Tracker', click: handlers.open },
        { type: 'separator' },
        { label: m.today, enabled: false },
        { label: m.status, enabled: false },
        ...(m.pending ? [{ label: m.pending, enabled: false }] : []),
        ...(m.canQuit ? [{ type: 'separator' as const }, { label: 'Quit', click: handlers.quit }] : [])
      ])
    )
  }
}
