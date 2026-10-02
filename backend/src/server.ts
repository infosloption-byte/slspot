import { buildApp } from './app.js'
import { AuthService } from './auth/service.js'
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
import {
  checkDatabase,
  connectDatabase,
  disconnectDatabase,
} from './db/prisma.js'

const authService = new AuthService(prisma)
const realtimeGateway = new RealtimeGateway({
  authenticate: (request) => authService.authenticateWebSocket(request),
})
const app = buildApp({
  checkDatabase,
  checkRedis,
  redisRequired: env.redisRequired,
  realtimeGateway,
  authService,
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
    await disconnectRedis()
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
