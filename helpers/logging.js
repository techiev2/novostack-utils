import { createWriteStream, mkdirSync as mkdir } from 'fs'
import { dirname } from 'path'

const appName = global['appName'] || globalThis['appName'] || 'novostack-utils'

class Logger {
  #app
  #rootPath
  outLog
  errorLog
  get name() {
    return global['appName'] || globalThis['appName'] || this.#app
  }
  constructor() {
    this.#app = appName
    this.#rootPath = dirname(process.argv[1])
    mkdir(`${this.#rootPath}/logs`, { recursive: true })
    this.outLog = createWriteStream(`${this.#rootPath}/logs/out.log`)
    this.errorLog = createWriteStream(`${this.#rootPath}/logs/error.log`)
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
    this.outLog.write(`[${this.now}] [${this.correlation}] [${this.name}] [LOG] ${label} - ${data}\n`)
  }
  error(label, data) {
    if (label && !data) { data = label, label = '[UNKNOWN]'}
    if (typeof data === 'object') { data = JSON.stringify(data) }
    this.errorLog.write(`[${this.now}] [${this.correlation}] [${this.name}] [ERROR] ${label} - ${data}\n`)
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