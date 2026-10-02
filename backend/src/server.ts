import { buildApp } from './app.js'
import { env } from './config/env.js'
import {
  checkRedis,
  connectRedis,
  disconnectRedis,
  isRedisReady,
  subscribe,
  unsubscribe,
} from './realtime/redis.js'
import { RealtimeGateway } from './realtime/gateway.js'

const realtimeGateway = new RealtimeGateway()
const app = buildApp({
  checkDatabase: async () => (await import('./db/prisma.js')).checkDatabase(),
  checkRedis,
  redisRequired: env.redisRequired,
  realtimeGateway,
})
let shuttingDown = false

async function shutdown(signal: string) {
  if (shuttingDown) return

  shuttingDown = true
  app.log.info({ signal }, 'Shutdown requested')

  const timeout = setTimeout(() => {
    app.log.error('Graceful shutdown timed out')
    process.exit(1)
  }, env.shutdownTimeoutMs)

  timeout.unref()

  try {
    await unsubscribe(env.redisChannel)
    realtimeGateway.closeAll()
    await app.close()
    disconnectRedis()
    const { disconnectDatabase } = await import('./db/prisma.js')
    await disconnectDatabase()
    clearTimeout(timeout)
    app.log.info('Shutdown complete')
  } catch (error) {
    clearTimeout(timeout)
    app.log.error({ err: error }, 'Graceful shutdown failed')
    process.exitCode = 1
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT')
})

process.once('SIGTERM', () => {
  void shutdown('SIGTERM')
})

try {
  const { connectDatabase } = await import('./db/prisma.js')
  await connectDatabase()

  try {
    await connectRedis()
    await subscribe(env.redisChannel, (message) => {
      if (isRedisReady()) {
        realtimeGateway.broadcastSerialized(message)
      }
    })
    app.log.info({ channel: env.redisChannel }, 'Redis realtime broker connected')
  } catch (error) {
    if (env.redisRequired) throw error
    app.log.warn({ err: error }, 'Redis is unavailable; continuing without distributed realtime')
  }

  await app.listen({ host: env.host, port: env.port })
  app.log.info(
    { host: env.host, port: env.port },
    'SL Spot API listening',
  )
} catch (error) {
  app.log.error({ err: error }, 'API startup failed')
  process.exit(1)
}
