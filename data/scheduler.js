import { randomUUID } from 'crypto'

import logger from '../helpers/logging.js'
import fetch from '../helpers/http.js'

let redisClient
let watcher

async function sendToHTTP(action) {
  try {
    const response = await fetch(action)
    logger.log(`scheduler.http`, response)
  } catch (error) {
    logger.error(`scheduler.http.error`, { action, error })
  }
}

async function sendToQueue(action) {
  logger.log(`scheduler.queue`, action)
}

export const scheduler = {
  async schedule({ scheduleAt, payload }) {
    try {
      if (isNaN(+scheduleAt) || !+scheduleAt) throw { message: `No valid schedule timestamp provided.` }
      if (+scheduleAt < new Date().getTime()) throw { message: `Cannot schedule an event in the past. `}
      const id = randomUUID()
      const key = `${id}____${JSON.stringify(payload)}`
      const expiry = Math.ceil((scheduleAt - new Date().getTime()) / 1000)
      await redisClient.set(key, 1)
      await redisClient.EXPIRE(key, expiry)
    } catch (error) {
      logger.error(`scheduler.schedule`, error)
      throw error
    }
  }
}

export async function createScheduler(redis) {
  redisClient = redis
  await redisClient.configSet('notify-keyspace-events', 'KEAx');
  watcher = redisClient.duplicate()
  watcher.connect()
  await watcher.configSet('notify-keyspace-events', 'KEAx');
  watcher.pSubscribe('*', async (event, key) => {
    if (event !== 'expired') return
    let action = {}
    try {
      action = JSON.parse(key.split('____')[1])
    } catch (_) {
      //
    }
    if (action.url) return sendToHTTP(action)
    if (action.queue) return sendToQueue(action)
    return logger.error(`scheduler.invalid_action`, action)
  })
  return scheduler
}
