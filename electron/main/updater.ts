// Auto-update from GitHub Releases (roadmap M12). Checks at startup and every
// 6 hours and downloads quietly. When a new version is downloaded while someone
// is being tracked, a Windows notification says so: clicking it restarts into the
// new version at once. Otherwise the update installs itself the next time nobody
// is being tracked (outside shift hours, or while the screen is locked), or when
// the app quits. The first start of a new version says so once.
import { app, Notification } from 'electron'
import updater from 'electron-updater'
import { log } from './log'
import { persisted } from './store'
import { isFirstStartAfterUpdate, readyNotice, updatedNotice, type Notice } from './updateNotice'

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000
const TRY_INSTALL_EVERY_MS = 10 * 60 * 1000

/** Kept referenced, so Windows can still deliver a click after this returns. */
let shown: Notification | null = null

function notify(notice: Notice, onClick?: () => void): void {
  if (!Notification.isSupported()) return
  shown = new Notification({ title: notice.title, body: notice.body })
  if (onClick) shown.on('click', onClick)
  shown.show()
}

export function startUpdater(isTracking: () => boolean): void {
  if (!app.isPackaged) {
    // Development builds only: PSEO_TEST_UPDATE_NOTICE=<version> shows the "ready" notification.
    const test = process.env.PSEO_TEST_UPDATE_NOTICE
    if (test) notify(readyNotice(test), () => log.info(`updater (test): the notification for ${test} was clicked`))
    log.info('updater: off in development')
    return
  }

  const current = app.getVersion()
  const store = persisted()
  if (isFirstStartAfterUpdate(store.get('lastVersion'), current)) {
    log.info(`updater: now running ${current}`)
    notify(updatedNotice(current))
  }
  store.set('lastVersion', current)

  const { autoUpdater } = updater
  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  let downloaded = ''
  const install = (why: string) => {
    log.info(`updater: installing ${downloaded} (${why})`)
    autoUpdater.quitAndInstall(true, true) // silent, then start the new version; quitting first saves the tracked time
  }
  const installIfIdle = () => {
    if (downloaded && !isTracking()) install('nobody is being tracked')
  }

  autoUpdater.on('update-available', (info) => log.info(`updater: ${info.version} available, downloading`))
  autoUpdater.on('update-downloaded', (info) => {
    downloaded = info.version
    log.info(`updater: ${info.version} downloaded`)
    if (!isTracking()) return install('nobody is being tracked')
    notify(readyNotice(info.version), () => install('the notification was clicked'))
  })
  autoUpdater.on('error', (err) => log.warn('updater:', err?.message ?? String(err)))

  const check = () => void autoUpdater.checkForUpdates().catch((err: Error) => log.warn('updater: check failed:', err.message))
  check()
  setInterval(check, CHECK_EVERY_MS).unref()
  setInterval(installIfIdle, TRY_INSTALL_EVERY_MS).unref()
}
