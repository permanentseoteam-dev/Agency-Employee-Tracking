// Auto-update from GitHub Releases (roadmap M12). Checks at startup and every
// 5 minutes and downloads quietly. As soon as a new version is downloaded it
// installs, even while someone is being tracked: a Windows notification says so,
// the app quits (which saves the tracked time) and restarts into the new version in
// about 10 seconds, with its window as it was. If installing fails, it installs when
// the app quits. The first start of a new version says so once.
import { app, Notification } from 'electron'
import updater from 'electron-updater'
import { log } from './log'
import { persisted } from './store'
import { isFirstStartAfterUpdate, updatedNotice, updatingNotice, type Notice } from './updateNotice'

const CHECK_EVERY_MS = 5 * 60 * 1000
/** Time to read the "updating" notification before the app restarts. */
const NOTICE_MS = 5 * 1000

/** Kept referenced, so Windows can still show it after this returns. */
let shown: Notification | null = null

function notify(notice: Notice): void {
  if (!Notification.isSupported()) return
  shown = new Notification({ title: notice.title, body: notice.body })
  shown.show()
}

/**
 * `beforeInstall` runs just before the app quits to install (index.ts remembers whether the
 * window was open, so the restarted app comes back the same way).
 */
export function startUpdater(beforeInstall: () => void): void {
  if (!app.isPackaged) {
    // Development builds only: PSEO_TEST_UPDATE_NOTICE=<version> shows the "updating" notification.
    const test = process.env.PSEO_TEST_UPDATE_NOTICE
    if (test) notify(updatingNotice(test))
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

  let installing = false
  autoUpdater.on('update-available', (info) => log.info(`updater: ${info.version} available, downloading`))
  autoUpdater.on('update-downloaded', (info) => {
    if (installing) return
    installing = true
    log.info(`updater: ${info.version} downloaded, installing now`)
    notify(updatingNotice(info.version))
    setTimeout(() => {
      beforeInstall()
      autoUpdater.quitAndInstall(true, true) // silent, then start the new version; quitting first saves the tracked time
    }, NOTICE_MS)
  })
  autoUpdater.on('error', (err) => log.warn('updater:', err?.message ?? String(err)))

  const check = () => {
    if (installing) return
    void autoUpdater.checkForUpdates().catch((err: Error) => log.warn('updater: check failed:', err.message))
  }
  check()
  setInterval(check, CHECK_EVERY_MS).unref()
}
