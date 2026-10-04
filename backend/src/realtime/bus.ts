import { env } from '../config/env.js'
import { isRedisReady, publish } from './redis.js'

type LocalSink = (message: string) => void

let localSink: LocalSink | null = null

/**
 * Registers the in-process delivery target (the WebSocket gateway).
 *
 * Realtime events normally travel Redis pub/sub -> every API instance -> its gateway.
 * When Redis is not available (typical for local development, and allowed because
 * REDIS_REQUIRED defaults to false) the events used to be dropped silently, so no
 * market prices, trade, position or wallet updates ever reached the browser even
 * though the WebSocket was connected. The local sink keeps a single instance working.
 */
export function setLocalRealtimeSink(sink: LocalSink | null): void {
  localSink = sink
}

/**
 * Publishes a serialized realtime event.
 * - Redis ready: publish to Redis. The subscriber in server.ts hands it to the gateway,
 *   so delivering it locally as well would send every event twice.
 * - Redis missing or failing: deliver straight to this process's gateway.
 */
export async function publishRealtime(message: string): Promise<void> {
  if (isRedisReady()) {
    try {
      await publish(env.redisChannel, message)
      return
    } catch {
      // Fall through to local delivery so connected clients still get the update.
    }
  }

  localSink?.(message)
}
