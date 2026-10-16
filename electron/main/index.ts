import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import appIcon from '../../build/icon.png?asset'
import { ensureAutostart, HIDDEN_ARG } from './autostart'
import { onStatus, shutdown, startEngine, status, stopNow } from './engine'
import { registerIpc } from './ipc'
import { initLog, log } from './log'
import { startSessionRefresh } from './session'
import { persisted } from './store'
import { createTray } from './tray'
import { startUpdater } from './updater'

const here = import.meta.dirname

initLog()

// One tracker per PC: a second launch focuses the running app and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let win: BrowserWindow | null = null
  let quitting = false

  const showWindow = () => {
    if (!win || win.isDestroyed()) win = createWindow(true)
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  const quit = () => {
    quitting = true
    app.quit()
  }

  function createWindow(visible: boolean): BrowserWindow {
    const w = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 960,
      minHeight: 600,
      show: false,
      title: 'PSEO Tracker',
      icon: appIcon,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(here, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    })

    if (visible) w.once('ready-to-show', () => w.show())

    // Closing the window keeps the app (and tracking) running in the tray.
    w.on('close', (event) => {
      if (!quitting) {
        event.preventDefault()
        w.hide()
      }
    })
    // Windows is shutting down, restarting or logging off: save the open segment now.
    w.on('session-end', () => {
      quitting = true
      stopNow()
    })

    // Never navigate the app window away from the app, and open links in the browser.
    w.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url)
      return { action: 'deny' }
    })
    w.webContents.on('will-navigate', (event, url) => {
      if (url !== w.webContents.getURL()) event.preventDefault()
    })

    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (!app.isPackaged && devUrl) {
      void w.loadURL(devUrl)
    } else {
      void w.loadFile(join(here, '../renderer/index.html'))
    }
    return w
  }

  app.on('second-instance', () => {
    log.info('second launch: focusing the running app')
    showWindow()
  })

  // Windows groups the app's notifications and taskbar entry under this id (matches electron-builder's appId).
  app.setAppUserModelId('com.permanentseo.pseotracker')

  app.whenReady().then(() => {
    log.info(`PSEO Tracker ${app.getVersion()} starting`)
    registerIpc({ quit })
    startSessionRefresh()
    startEngine()
    ensureAutostart()

    const updateTray = createTray({ open: showWindow, quit })
    updateTray(status())
    onStatus(updateTray)

    // The renderer always loads (it hands the session to the tracker); started at login it stays hidden.
    // After an automatic update the window comes back as it was (the installer starts the app plainly).
    const afterUpdate = persisted().get('showWindowAfterUpdate')
    if (afterUpdate !== null) persisted().set('showWindowAfterUpdate', null)
    win = createWindow(afterUpdate ?? !process.argv.includes(HIDDEN_ARG))

    startUpdater(() => persisted().set('showWindowAfterUpdate', !!win && !win.isDestroyed() && win.isVisible()))
  })

  // Close the open segment and give the queue a moment to sync before exiting.
  let finished = false
  app.on('before-quit', (event) => {
    quitting = true
    if (finished) return
    event.preventDefault()
    void shutdown().finally(() => {
      finished = true
      log.info('quit')
      app.quit()
    })
  })

  // The tray keeps the app alive; only an explicit quit ends it.
  app.on('window-all-closed', () => {})
}
