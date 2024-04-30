import { createWriteStream, mkdirSync as mkdir } from 'fs'
import { dirname } from 'path'

const appName = global['appName'] || globalThis['appName'] || 'novostack-utils'

class Logger {
  #app
  #rootPath
  #noLogger
  outLog
  errorLog
  get name() {
    return global['appName'] || globalThis['appName'] || this.#app
  }
  constructor() {
    this.#app = appName
    this.#rootPath = dirname(process.argv[1])
    this.#noLogger = !!process.env['NO_LOGGER']
    if (!this.#noLogger) mkdir(`${this.#rootPath}/logs`, { recursive: true })
    // Cloud fn specific temporary fix. This is to stream into console log in cloud fns that don't allow file creation.
    this.outLog = this.#noLogger ? null : createWriteStream(`${this.#rootPath}/logs/out.log`)
    this.errorLog = this.#noLogger ? null : createWriteStream(`${this.#rootPath}/logs/error.log`)
  }
  get now() {
    return new Date().toISOString()
  }
  get correlation() {
    return globalThis['x-correlation-id'] || 'NO_CORRELATION_REF'
  }
  log(label, data) {
    if (label && !data) { data = label, label = '[UNKNOWN]'}
    if (typeof data === 'object') { data = JSON.stringify(data) }
    const message = `[${this.now}] [${this.correlation}] [${this.name}] [LOG] ${label} - ${data}\n`
    if (this.#noLogger) return console.log(message)
    this.outLog.write(message)
  }
  error(label, data) {
    if (label && !data) { data = label, label = '[UNKNOWN]'}
    if (typeof data === 'object') { data = JSON.stringify(data) }
    const message = `[${this.now}] [${this.correlation}] [${this.name}] [ERROR] ${label} - ${data}\n`
    if (this.#noLogger) return console.log(message)
    this.errorLog.write(message)
  }
}

let logger = new Logger()
export default logger

process
  .on('exit', cleanupLogStreams)
  .on('SIGTERM', cleanupLogStreams)
  .on('SIGINT', cleanupLogStreams)
  .on('SIGQUIT', cleanupLogStreams)

async function cleanupLogStreams(signal) {
  if (!signal) return
  console.log(`[${signal}] Checking and cleaning up log streams...`)
  !logger.outLog.closed && await logger.outLog.close()
  !logger.errorLog.closed && await logger.errorLog.close()
  console.log(`[${signal}] Cleaned up streams...`)
  process.exit(0)
}
