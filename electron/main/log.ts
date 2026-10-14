import log from 'electron-log/main'

// File log at %APPDATA%\PSEO Tracker\logs\main.log, rotated at 5 MB.
export function initLog(): void {
  log.transports.file.maxSize = 5 * 1024 * 1024
  log.transports.file.level = 'info'
  log.transports.console.level = import.meta.env.DEV ? 'debug' : false
  log.errorHandler.startCatching()
}

export function logsFolder(): string {
  return log.transports.file.getFile().path.replace(/[\\/][^\\/]+$/, '')
}

export { log }
