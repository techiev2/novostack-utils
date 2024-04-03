import Express, { json, Router } from 'express'
import cors from 'cors'

class API {
  #app
  constructor() {
    this.#app = Express()
    this.#app.use(json({ strict: true })).use(cors({ origin: '*' })).disable('x-powered-by')
  }
  async start(port, host, prechecks = []) {
    try {
      await Promise.all(prechecks.map((fn) => fn()))  // Curry this?
    } catch (error) {
      process.exit(1)
    }
    this.#app.listen(port, host, () => {
      console.log(`[INFO] [API] Listening at http://${host}:${port}`)
    })
  }
  register(prefix, router) {
    this.#app.use(prefix, router)
    return this
  }
}
const api = new API()
export default api
export { Router }