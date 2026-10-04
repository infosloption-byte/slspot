import { buildApp } from './app.js'
import { PlatformApiService } from './api/service.js'
import { createMarketDataProvider } from './market/index.js'
import { MarketDataService } from './market/service.js'
import { TradingService } from './trading/service.js'
import { AuthService } from './auth/service.js'
import { AdminService } from './admin/service.js'
import { env } from './config/env.js'
import { prisma } from './db/prisma.js'
import {
  checkRedis,
  connectRedis,
  disconnectRedis,
  isRedisReady,
  subscribe,
  unsubscribe,
} from './realtime/redis.js'
import { RealtimeGateway } from './realtime/gateway.js'
import { setLocalRealtimeSink } from './realtime/bus.js'
import {
  checkDatabase,
  connectDatabase,
  disconnectDatabase,
} from './db/prisma.js'

const authService = new AuthService(prisma)
const adminService = new AdminService(prisma)
const apiService = new PlatformApiService(prisma)
const marketDataProvider = createMarketDataProvider()
const marketDataService = new MarketDataService(prisma, marketDataProvider)
const tradingService = new TradingService(prisma)
const realtimeGateway = new RealtimeGateway({
  authenticate: (request) => authService.authenticateWebSocket(request),
})
// Without Redis, realtime events are delivered straight to this process's gateway.
setLocalRealtimeSink((message) => realtimeGateway.broadcastSerialized(message))
const app = buildApp({
  checkDatabase,
  checkRedis,
  redisRequired: env.redisRequired,
  realtimeGateway,
  authService,
  apiService,
  marketDataService,
  tradingService,
  adminService,
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
    await tradingService.stop()
    await marketDataService.stop()
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
  const bootstrappedAdmins = await adminService.bootstrapConfiguredAdmins()
  if (bootstrappedAdmins > 0) app.log.info({ count: bootstrappedAdmins }, 'Configured administrator access bootstrapped')

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
  await marketDataService.start()
  await tradingService.start()
  app.log.info(
    { host: env.host, port: env.port },
    'SL Spot API listening',
  )
} catch (error) {
  app.log.error({ err: error }, 'API startup failed')
  process.exit(1)
}
