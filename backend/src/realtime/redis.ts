import { createClient, type RedisClientType } from 'redis'
import { env } from '../config/env.js'

type RedisClient = RedisClientType

let client: RedisClient | null = null
let subscriber: RedisClient | null = null
let lastError: Error | null = null

function createRedisClient(): RedisClient {
  const next = createClient({
    url: env.redisUrl,
    socket: {
      connectTimeout: env.redisConnectTimeoutMs,
      // Do not let an unavailable optional Redis instance block backend startup.
      // The server handles the connection error and continues when REDIS_REQUIRED=false.
      reconnectStrategy: (retries) => {
        if (retries >= 2) return new Error('Redis connection unavailable')
        return Math.min(250 * 2 ** retries, 1_000)
      },
    },
  }) as RedisClient

  next.on('error', (error) => {
    lastError = error instanceof Error ? error : new Error(String(error))
  })

  next.on('ready', () => {
    lastError = null
  })

  return next
}

export function isRedisReady(): boolean {
  return Boolean(client?.isReady && subscriber?.isReady)
}

export function getRedisLastError(): Error | null {
  return lastError
}

export async function connectRedis(): Promise<void> {
  if (isRedisReady()) return

  const nextClient = createRedisClient()
  const nextSubscriber = nextClient.duplicate()

  nextSubscriber.on('error', (error) => {
    lastError = error instanceof Error ? error : new Error(String(error))
  })

  try {
    await nextClient.connect()
    await nextSubscriber.connect()
    client = nextClient
    subscriber = nextSubscriber
  } catch (error) {
    nextClient.destroy()
    nextSubscriber.destroy()
    throw error
  }
}

export async function checkRedis(): Promise<boolean> {
  if (!client?.isReady) return false

  try {
    await client.ping()
    return true
  } catch {
    return false
  }
}

export function redisKey(key: string): string {
  return env.redisKeyPrefix + key
}

export async function getValue(key: string): Promise<string | null> {
  if (!client?.isReady) return null
  return client.get(redisKey(key))
}

export async function setValue(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  if (!client?.isReady) throw new Error('Redis is not connected')
  if (ttlSeconds !== undefined) {
    await client.set(redisKey(key), value, { EX: ttlSeconds })
    return
  }
  await client.set(redisKey(key), value)
}

export async function incrementWithExpiry(key: string, windowSeconds: number): Promise<number> {
  if (!client?.isReady) throw new Error('Redis is not connected')
  const fullKey = redisKey(key)
  const count = await client.incr(fullKey)
  if (count === 1) await client.expire(fullKey, windowSeconds)
  return count
}

export async function deleteValue(key: string): Promise<void> {
  if (!client?.isReady) throw new Error('Redis is not connected')
  await client.del(redisKey(key))
}

export async function publish(channel: string, message: string): Promise<number> {
  if (!client?.isReady) throw new Error('Redis is not connected')
  return client.publish(channel, message)
}

export async function subscribe(
  channel: string,
  handler: (message: string) => void,
): Promise<void> {
  if (!subscriber?.isReady) throw new Error('Redis is not connected')
  await subscriber.subscribe(channel, handler)
}

export async function unsubscribe(channel: string): Promise<void> {
  if (!subscriber?.isReady) return
  await subscriber.unsubscribe(channel)
}

export async function disconnectRedis(): Promise<void> {
  const currentClient = client
  const currentSubscriber = subscriber

  client = null
  subscriber = null

  currentSubscriber?.destroy()
  currentClient?.destroy()
}
