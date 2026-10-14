// Auto-update from GitHub Releases (roadmap M12). Checks at startup and every
// 6 hours and downloads quietly. Staff rarely quit the app (employees have no
// Quit), so a downloaded update also installs itself the next time nobody is
// being tracked: outside shift hours, or while the screen is locked.
import { app } from 'electron'
import updater from 'electron-updater'
import { log } from './log'

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const TRY_INSTALL_EVERY_MS = 10 * 60 * 1000

export function startUpdater(isTracking: () => boolean): void {
  if (!app.isPackaged) {
    log.info('updater: off in development')
    return
  }
  const { autoUpdater } = updater
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  let downloaded = ''
  const installIfIdle = () => {
    if (!downloaded || isTracking()) return
    log.info(`updater: installing ${downloaded} while nobody is being tracked`)
    autoUpdater.quitAndInstall(true, true) // silent, then start the new version
  }

  autoUpdater.on('update-available', (info) => log.info(`updater: ${info.version} available, downloading`))
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = info.version
    log.info(`updater: ${info.version} downloaded`)
    installIfIdle()
  })
  autoUpdater.on('error', (err) => log.warn('updater:', err?.message ?? String(err)))

  const check = () => void autoUpdater.checkForUpdates().catch((err: Error) => log.warn('updater: check failed:', err.message))
  check()
  setInterval(check, CHECK_EVERY_MS).unref()
  setInterval(installIfIdle, TRY_INSTALL_EVERY_MS).unref()
}
