// Tray icon and menu (plan §4.1): Open, today's time, status, and Quit for
// managers and admins only. The icon is the logo with a dot for the tracker state.
import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron'
import trayLogo from '../../build/icon.png?asset'
import type { TrackerStatus } from '../preload/api'
import { log } from './log'
import { TRAY_SIZE, withStatusDot } from './trayIcon'
import { trayModel, type Tone } from './trayMenu'

const COLORS: Record<Tone, [number, number, number]> = {
  active: [22, 163, 74], // green-600
  idle: [245, 158, 11], // amber-500
  off: [100, 116, 139], // slate-500
  signedOut: [220, 38, 38] // red-600
}

// The logo is read once and kept: a state change never touches the disk, and a
// logo that can't be read leaves the plain status dot instead of an error.
let logo: Buffer | null | undefined
function logoBitmap(): Buffer | null {
  if (logo === undefined) {
    const bmp = nativeImage.createFromPath(trayLogo).resize({ width: TRAY_SIZE, height: TRAY_SIZE, quality: 'best' }).toBitmap()
    logo = bmp.length === TRAY_SIZE * TRAY_SIZE * 4 ? bmp : null
    if (!logo) log.warn(`tray: could not read the logo at ${trayLogo}; showing the status dot only`)
  }
  return logo
}

const icons = new Map<Tone, NativeImage>()
function icon(tone: Tone): NativeImage {
  if (!icons.has(tone)) {
    const bitmap = withStatusDot(logoBitmap(), COLORS[tone])
    icons.set(tone, nativeImage.createFromBitmap(bitmap, { width: TRAY_SIZE, height: TRAY_SIZE, scaleFactor: 2 }))
  }
  return icons.get(tone)!
}

export function createTray(handlers: { open(): void; quit(): void }): (s: TrackerStatus) => void {
  // Every state's icon is made up front, while the logo file is surely there.
  for (const tone of Object.keys(COLORS) as Tone[]) icon(tone)
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
