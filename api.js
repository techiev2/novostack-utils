import { randomUUID } from 'crypto'
import { spawn } from 'child_process'

import Express, { json, Router } from 'express'
import cors from 'cors'
import logger from './helpers/logging.js'

function setupTracer(req, res, next) {
  let id = req.headers['x-tracer-id'] || randomUUID()
  globalThis.tracerID = id
  res.setHeader('x-tracer-id', id)
  next()
}

class API {
  #app
  constructor() {
    this.#app = Express()
    this.#app.use(json({ strict: true })).use(cors({ origin: '*' })).disable('x-powered-by').use(setupTracer)
  }
  async start(port, host, prechecks = []) {
    try {
      await Promise.all(prechecks.map((fn) => fn()))  // Curry this?
    } catch (error) {
      process.exit(1)
    }
    this.#app.listen(port, host, () => {
      logger.log(`API`, `Listening at http://${host}:${port}`)
    })
  }
  register(prefix, router) {
    this.#app.use(prefix, router)
    return this
  }
}

process.on('SIGUSR2', onExit)
function onExit() {
  spawn(process.argv.shift(), process.argv, {
    cwd: process.cwd(),
    detached : true,
    stdio: "inherit"
  });
  process.exit();
}

const api = new API()
export default api
export { Router }