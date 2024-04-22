import { request } from 'http';
import logger from './logging.js';

const DEFAULT_TIMEOUT_MILLISECONDS = 30000

async function fetch({url, method = 'GET', headers = {}, data = {}, timeout = DEFAULT_TIMEOUT_MILLISECONDS}) {
  timeout = isNaN(+timeout) || +timeout > DEFAULT_TIMEOUT_MILLISECONDS ? DEFAULT_TIMEOUT_MILLISECONDS : +timeout
  let start = new Date().getTime()
  Object.assign(headers, { 'x-tracer-id': globalThis.tracerID || '', 'User-Agent': 'Novostack v1.0.0', 'Content-Type': 'application/json' })
  const postData = JSON.stringify(data);
  const { hostname: host, port, pathname: path, search } = new URL(url)
  Object.assign(headers, { 'Content-Length': postData.length })
  return new Promise((resolve, reject) => {
    let watcher = setTimeout(() => {
      clearTimeout(watcher)
      return reject({ message: 'TIMED_OUT', url, method })
    }, timeout)
    const req = request({ host, port, path: `${path}${search}`, headers, method, timeout }, (res) => {
      let response = ''
      res.on('data', (chunk) => {
        response += chunk
      });
      res.on('end', () => {
        try { response = JSON.parse(response) } catch (err) { }
        const timing = new Date().getTime() - start
        logger.log(`HTTP`, `${method.toUpperCase()} request to ${url} completed in ${timing}ms.`)
        resolve(response)
      })
    });
    req.on('error', ({ message }) => {
      return reject({ message: 'DOWNSTREAM_ERROR', url, method, metadata: { message } })
    });
    req.write(postData)
    req.end()
  })
}
export default fetch