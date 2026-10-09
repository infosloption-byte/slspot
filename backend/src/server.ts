import { buildApp } from './app.js'
import { PlatformApiService } from './api/service.js'
import { createMarketDataProvider } from './market/index.js'
import { MarketDataService } from './market/service.js'
import { TradingService } from './trading/service.js'
import { AuthService } from './auth/service.js'
import { AdminService } from './admin/service.js'
import { LedgerService } from './ledger/service.js'
import { LedgerReconciliationWorker } from './ledger/reconciliation-worker.js'
import { env } from './config/env.js'
import { PaymentService } from './payments/service.js'
import { PaymentProviderRegistry } from './payments/registry.js'
import { createSandboxProviders } from './payments/sandbox.js'
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
  validateSession: (sessionId) => authService.isSessionActive(sessionId),
})
// Without Redis, realtime events are delivered straight to this process's gateway.
setLocalRealtimeSink((message) => realtimeGateway.broadcastSerialized(message))
const ledgerService = new LedgerService(prisma)
const paymentRegistry = new PaymentProviderRegistry()
// Real adapters register here by id once provider credentials exist. Sandbox adapters can never load in production.
if (env.payments.sandbox) for (const provider of createSandboxProviders(env.payments.sandboxWebhookSecret)) paymentRegistry.register(provider)
const paymentService = new PaymentService(
  prisma,
  paymentRegistry,
  ledgerService,
  (userId, type, title, body) => apiService.createNotification(userId, type, title, body),
  env.payments,
)
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
  paymentService,
  paymentRegistry,
})
const reconciliationWorker = new LedgerReconciliationWorker(
  prisma,
  (userId, accountId) => ledgerService.reconcileWallet(userId, accountId),
  app.log,
  env.trading.reconcileIntervalMs,
)
let shuttingDown = false
let paymentExpiryTimer: NodeJS.Timeout | undefined

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
    reconciliationWorker.stop()
    if (paymentExpiryTimer) clearInterval(paymentExpiryTimer)
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
  app.log.info({ host: env.database.host, port: env.database.port, database: env.database.name }, 'Connecting to database')
  await connectDatabase()
  app.log.info('Database connection established')

  app.log.info('Bootstrapping configured administrators')
  const bootstrappedAdmins = await adminService.bootstrapConfiguredAdmins()
  if (bootstrappedAdmins > 0) app.log.info({ count: bootstrappedAdmins }, 'Configured administrator access bootstrapped')

  try {
    app.log.info({ host: new URL(env.redisUrl).hostname, port: new URL(env.redisUrl).port || 6379 }, 'Connecting to Redis')
    await connectRedis()
    app.log.info('Redis connection established')
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

  app.log.info('Starting market data service')
  await marketDataService.start()
  app.log.info('Market data service started')

  app.log.info('Starting trading service')
  await tradingService.start()
  app.log.info('Trading service started')

  await paymentService.syncProviderConfigs()
  paymentExpiryTimer = setInterval(() => {
    paymentService.expireStaleDeposits().catch((error) => app.log.error({ err: error }, 'Expiring stale deposits failed'))
  }, 60_000)
  paymentExpiryTimer.unref()
  app.log.info({ providers: paymentRegistry.size, sandbox: env.payments.sandbox }, 'Payments initialised')

  reconciliationWorker.start()
  if (env.trading.reconcileIntervalMs > 0) app.log.info({ intervalMs: env.trading.reconcileIntervalMs }, 'Scheduled wallet/ledger reconciliation started')
} catch (error) {
  app.log.error({ err: error }, 'API startup failed')
  process.exit(1)
}
