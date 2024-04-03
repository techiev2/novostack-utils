import { readFile, readdir, realpath } from "fs/promises"
import { dirname, basename } from "path"

export function getArgs() {
  const args = {}
  let key
  process.argv.slice(2).map((el) => {
    if (el.startsWith('-')) {
      key = el.replace(/\-{1,}/gmi, '')
      return
    }
    if (key) {
      args[key] = el
      key = null
      return
    }
  })
  return args
}

const isEnvFile = (name) => name.endsWith('env') || name.endsWith('envfile')
async function generateEnvData(path) {
  const lines = (await readFile(path)).toString().split('\n')
  return lines.map((line) => {
    let [key, value] = line.split(/\s*=\s*/gmi)
    if (!key || !value) return []
    value = value.replace(/'/gmi, "")
    return [key, value]
  }).filter((line) => line.length)
}

// This function is moot with the latest Node version/Deno/Bun. But, here for legacy support.
export async function loadEnv(args) {
  const workDir = await realpath(dirname(basename(dirname(process.argv[1]))))
  const possibleEnvFiles = (
    await readdir(workDir)
  ).filter(isEnvFile).map((path) => `${workDir}/${path}`)
  const env = {};
  (await Promise.all(possibleEnvFiles.map(generateEnvData)))
    .map((source) => {
      source.map(([key, value]) => {
        env[key] = value
      })
    })
  return env
}