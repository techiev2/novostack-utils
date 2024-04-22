// CONFIG SET notify-keyspace-events KEAx
// psubscribe '__key*__:*'zzzzzxxxxcc
// __keyevent@2__:expired

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
    logger.error(`scheduler.http`, error)
  }
}

async function sendToQueue(action) {
  logger.log(`scheduler.queue`, action)
}


export const scheduler = {
  async schedule({ scheduleAt, payload }) {
    try {
      const id = randomUUID()
      const key = `${id}____${JSON.stringify(payload)}`
      const expiry = Math.ceil((scheduleAt - new Date().getTime()) / 1000)
      await redisClient.set(key, 1)
      await redisClient.EXPIRE(key, expiry)
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
    } catch (error) {
      logger.error(`scheduler.schedule`, error)
    }
  }
}

export async function createScheduler(redis) {
  redisClient = redis
  await redisClient.configSet('notify-keyspace-events', 'KEAx');
  watcher = redisClient.duplicate()
  watcher.connect()
  await watcher.configSet('notify-keyspace-events', 'KEAx');
  return scheduler
}