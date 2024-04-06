import { readFileSync as readFile, readdirSync as readdir, realpathSync as realPath } from "fs";
import { promisify } from "util";
import { getArgs, loadEnv } from "../helpers/process.js";
import { connectDatabases, databases } from "../data/index.js";

async function migrateFile(migration, database) {
  let latestMigration
  try { latestMigration = readFile(migration).toString() } catch (e) { console.log(e); process.exit(1) }
  const lines = latestMigration.split(';').map(($) => $.trim()).filter(($) => !!$ && !$.startsWith('--'))
  let line
  const connection = await database.getConnection()
  connection.query = promisify(connection.query).bind(connection)
  let lineCount = lines.length
  let successes = 0
  connection.beginTransaction()
  console.log(`Migrating ${migration}`)
  try {
    for (line of lines) {
      line = line.replace('\n', ' ')
      await connection.query(line)
      console.log(`Completed ${++successes}`)
    }
  } catch (err) {
    console.log(`ERROR: ${err} - ${line}`)
    await connection.rollback()
  } finally {
    if (successes === lineCount) {
      console.log(await connection.commit())
    }
    await connection.close()
  }
}

const args = getArgs()
let { configs: configsPath, rootdir: migrationsDir, db: dbName, migration: migrationFile } = args
if (!migrationsDir) { console.log(`No migrations root folder provided.`); process.exit(1) }
if (!dbName) { console.log(`No database provided for applying latest migration.`); process.exit(1) }
let configs; try { configs = JSON.parse(readFile(realPath(configsPath))) } catch (e) { console.log(e); process.exit(e) }
;(async () => {
  const env = await loadEnv()
  await connectDatabases(configs.databases)
  const database = databases.mysql[dbName]
  if (!database) { console.log(`Database ${dbName} requested not found. Available databases: ${Object.keys(databases.mysql).join(', ').trim()}`); process.exit(1) }
  if (!migrationFile) {
    let migrations
    try { migrations = readdir(migrationsDir) } catch (e) { console.log(e); process.exit(1) }
    migrations = migrations
      .filter((file) => file.endsWith('.sql') && !isNaN(file.split('.')[0]))
      .sort((a, b) => +(a.split('.')[0]) - +(b.split('.')[0]))
    for (const migration of migrations) {
      try { await migrateFile(`${migrationsDir}/${migration}`, database) } catch (error) { console.log(`[ERROR] While migrating ${migration} - ${error}`)}
    }
  } else {
    await migrateFile(`${migrationsDir}/${migrationFile}`, database)
  }
  process.exit(0)
})()