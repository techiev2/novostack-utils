import { request } from 'http'

async function fetch({url, method = 'GET', headers = {}, data = {}}) {
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
        resolve(response)
      })
    });
    req.on('error', reject);
    req.write(postData)
    req.end()
  })
}
export default fetch