import { createPool } from 'mysql2'
import { createClient } from 'redis'
import { promisify } from 'util'

const databases = {
  mysql: {},
  redis: {}
}

async function connectMySQLDatabases(configs = {}) {
  await Promise.all(Object.entries(configs)
    .map(async ([name, config]) => {
      try {
        const client = createPool(config)
        client.query = promisify(client.query).bind(client)
        client.getConnection = promisify(client.getConnection).bind(client)
        await client.query('select 1')
        console.log(`[INFO] [DB] Connected to MySQL database - ${name}`)
        databases.mysql[name] = client
      } catch (error) {
        console.log(`[ERROR] [DB] Unable to connect to MySQL database - ${name}`)
        process.exit(1)
      }
    })
  )
}

async function connectRedisDatabases(configs = {}) {
  await Promise.all(Object.entries(configs)
    .map(async ([name, config]) => {
      try {
        const client = createClient(config)
        await client.connect()
        await client.ping()
        console.log(`[INFO] [DB] Connected to Redis database - ${name}`)
        databases.redis[name] = client
      } catch (error) {
        console.log(`[ERROR] [DB] Unable to connect to Redis database - ${name} || ${error}`)
        process.exit(1)
      }
    })
  )
}

async function connectDatabases({ mysql: mysqlConfigs = {}, redis: redisConfigs = {} } = {}) {
  await Promise.all([connectMySQLDatabases(mysqlConfigs), connectRedisDatabases(redisConfigs)])
}

export { databases, connectDatabases }