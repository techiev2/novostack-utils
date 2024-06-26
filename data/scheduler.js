import { randomUUID } from 'crypto'

import logger from '../helpers/logging.js'
import fetch from '../helpers/http.js'

let redisClient
let watcher

let DEFAULT_RETRY_TIMEOUT_MINUTES = 5

async function sendToHTTP(action, entity) {
  let { retryIn }  = action
  delete action.retryIn
  retryIn =  isNaN(+retryIn) || !+retryIn ? DEFAULT_RETRY_TIMEOUT_MINUTES : +retryIn
  try {
    const response = await fetch(action)
    logger.log(`scheduler.http`, response)
  } catch (error) {
    // TODO: Add to a queue for further processing.
    let now = new Date()
    now.setMinutes(now.getMinutes(retryIn))
    logger.error(`scheduler.http.error`, { action, error })
    logger.error(`scheduler.http.retry`, `Retrying for ${now.toISOString()}`)
    await scheduler.schedule({scheduleAt: now, namespace: entity, payload: { ...action, retryIn } })
  }
}

async function sendToQueue(action) {
  logger.log(`scheduler.queue`, action)
}

export const scheduler = {
  async schedule({ scheduleAt, namespace, payload }) {
    try {
      if (isNaN(+scheduleAt) || !+scheduleAt) throw { message: `No valid schedule timestamp provided.` }
      if (+scheduleAt < new Date().getTime()) throw { message: `Cannot schedule an event in the past. `}
      const id = randomUUID()
      const key = `${id}____${namespace}____${JSON.stringify(payload)}`
      const expiry = Math.ceil((scheduleAt - new Date().getTime()) / 1000)
      await redisClient.set(key, 1)
      await redisClient.EXPIRE(key, expiry)
    } catch (error) {
      logger.error(`scheduler.schedule`, error)
      throw error
    }
  },
  async scheduledActions(namespace) {
    const keys = await redisClient.keys(`*____${namespace}____*`)
    const expiryMap = Object.fromEntries(await Promise.all((await Promise.all(keys.map((key) => {
      return [key, redisClient.TTL(key)]
    }))).map(async ([key, exp]) => {
      return [key, await exp]
    })))
    const now = new Date()
    return keys.map((key) => {
      let [reference, _, payload] = key.split('____')
      const scheduled_at = new Date()
      scheduled_at.setSeconds(scheduled_at.getSeconds() + expiryMap[key])
      return { reference, payload, scheduled_at: scheduled_at.getTime() / 1000}
    })
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
    let action
    let entity
    try {
      const splits = key.split('____')
      action = JSON.parse(splits[2])
      entity = splits[0]
    } catch (actionParseError) {
      logger.error(`scheduler.action.parseError`, { action, actionParseError })
    }
    if (action.url) return sendToHTTP(action, entity)
    if (action.queue) return sendToQueue(action)
    return logger.error(`scheduler.invalid_action`, action)
  })
  return scheduler
}
