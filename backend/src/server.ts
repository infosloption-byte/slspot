import { buildApp } from './app.js'
import { env } from './config/env.js'
import { checkDatabase, connectDatabase, disconnectDatabase } from './db/prisma.js'

const app = buildApp({ checkDatabase })
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
    await app.close()
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
  await app.listen({ host: env.host, port: env.port })
  app.log.info(
    { host: env.host, port: env.port },
    'SL Spot API listening',
  )
} catch (error) {
  app.log.error({ err: error }, 'API startup failed')
  process.exit(1)
}
