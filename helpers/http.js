import { request } from 'http'

async function fetch({url, method = 'GET', headers = {}, data = {}}) {
  let start = new Date().getTime()
  Object.assign(headers, { 'x-tracer-id': globalThis.tracerID, 'User-Agent': 'Novostack v1.0.0' })
  const postData = JSON.stringify(data);
  const { hostname: host, port, pathname: path, search } = new URL(url)
  Object.assign(headers, { 'Content-Length': postData.length })
  return new Promise((resolve, reject) => {
    const req = request({ host, port, path: `${path}${search}`, headers, method }, (res) => {
      let response = ''
      res.on('data', (chunk) => {
        response += chunk
      });
      res.on('end', () => {
        try { response = JSON.parse(response) } catch (err) { }
        const timing = new Date().getTime() - start
        console.log(`[INFO] [HTTP] ${method.toUpperCase()} request to ${url} completed in ${timing}ms.`)
        resolve(response)
      })
    });
    req.on('error', reject);
    req.write(postData)
    req.end()
  })
}
export default fetch