const NODE_ENVS = ['development', 'test', 'production'] as const
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const

type NodeEnv = (typeof NODE_ENVS)[number]
type LogLevel = (typeof LOG_LEVELS)[number]

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '8080')

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a valid TCP port between 1 and 65535')
  }

  return port
}

function parsePositiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value ?? String(fallback))

  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    )
  }

  return parsed
}

function parseNodeEnv(value: string | undefined): NodeEnv {
  const nodeEnv = value ?? 'development'

  if (!NODE_ENVS.includes(nodeEnv as NodeEnv)) {
    throw new Error('NODE_ENV must be development, test, or production')
  }

  return nodeEnv as NodeEnv
}

function parseLogLevel(value: string | undefined): LogLevel {
  const logLevel = value ?? 'info'

  if (!LOG_LEVELS.includes(logLevel as LogLevel)) {
    throw new Error('LOG_LEVEL must be fatal, error, warn, info, debug, or trace')
  }

  return logLevel as LogLevel
}

function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  const normalized = (value ?? String(fallback)).trim().toLowerCase()

  if (normalized === 'true') return true
  if (normalized === 'false') return false

  throw new Error(`${name} must be true or false`)
}

function parseDatabaseUrl(
  value: string | undefined,
  nodeEnv: NodeEnv,
): {
  url: string
  host: string
  port: number
  user: string
  password: string
  name: string
} {
  const fallback = 'mysql://slspot:slspot@127.0.0.1:3307/slspot'
  const rawUrl = value ?? fallback

  if (nodeEnv === 'production' && value === undefined) {
    throw new Error('DATABASE_URL must be explicitly configured in production')
  }

  let parsed: URL

  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('DATABASE_URL must be a valid MySQL connection URL')
  }

  if (parsed.protocol !== 'mysql:') {
    throw new Error('DATABASE_URL must use the mysql:// scheme')
  }

  const databaseName = parsed.pathname.replace(/^\//, '')

  if (!parsed.hostname || !databaseName) {
    throw new Error('DATABASE_URL must include a database host and database name')
  }

  const port = parsed.port ? Number(parsed.port) : 3306

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('DATABASE_URL contains an invalid database port')
  }

  return {
    url: parsed.toString(),
    host: parsed.hostname,
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    name: decodeURIComponent(databaseName),
  }
}

function parseRedisUrl(value: string | undefined, nodeEnv: NodeEnv): string {
  const rawUrl = value ?? 'redis://127.0.0.1:6379'

  if (nodeEnv === 'production' && value === undefined) {
    throw new Error('REDIS_URL must be explicitly configured in production')
  }

  let parsed: URL

  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('REDIS_URL must be a valid redis:// or rediss:// URL')
  }

  if (!['redis:', 'rediss:'].includes(parsed.protocol) || parsed.origin !== parsed.protocol + '//' + parsed.host) {
    throw new Error('REDIS_URL must use redis:// or rediss:// and include only a host/port origin')
  }

  return parsed.toString()
}

function parseCorsOrigins(value: string | undefined, nodeEnv: NodeEnv): string[] {
  const rawOrigins = (value ?? 'http://localhost:5173')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (rawOrigins.length === 0) {
    throw new Error('CORS_ORIGIN must contain at least one origin')
  }

  if (rawOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN cannot use * when browser credentials are enabled')
  }

  const origins = rawOrigins.map((origin) => {
    let parsed: URL

    try {
      parsed = new URL(origin)
    } catch {
      throw new Error(`CORS_ORIGIN contains an invalid origin: ${origin}`)
    }

    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
      throw new Error(`CORS_ORIGIN must contain only scheme + host origins: ${origin}`)
    }

    return parsed.origin
  })

  if (nodeEnv === 'production' && value === undefined) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production')
  }

  return [...new Set(origins)]
}

const nodeEnv = parseNodeEnv(process.env.NODE_ENV)
const database = parseDatabaseUrl(process.env.DATABASE_URL, nodeEnv)
const redisUrl = parseRedisUrl(process.env.REDIS_URL, nodeEnv)

export const env = {
  nodeEnv,
  host: process.env.HOST?.trim() || '0.0.0.0',
  port: parsePort(process.env.PORT),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN, nodeEnv),
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
  trustProxy: parseBoolean('TRUST_PROXY', process.env.TRUST_PROXY, false),
  requestTimeoutMs: parsePositiveInteger(
    'REQUEST_TIMEOUT_MS',
    process.env.REQUEST_TIMEOUT_MS,
    30_000,
    1_000,
    120_000,
  ),
  shutdownTimeoutMs: parsePositiveInteger(
    'SHUTDOWN_TIMEOUT_MS',
    process.env.SHUTDOWN_TIMEOUT_MS,
    10_000,
    1_000,
    30_000,
  ),
  bodyLimitBytes: parsePositiveInteger(
    'BODY_LIMIT_BYTES',
    process.env.BODY_LIMIT_BYTES,
    1_048_576,
    1_024,
    10_485_760,
  ),
  database,
  databaseConnectionLimit: parsePositiveInteger(
    'DATABASE_CONNECTION_LIMIT',
    process.env.DATABASE_CONNECTION_LIMIT,
    10,
    1,
    100,
  ),
  redisUrl,
  redisRequired: parseBoolean('REDIS_REQUIRED', process.env.REDIS_REQUIRED, false),
  redisConnectTimeoutMs: parsePositiveInteger(
    'REDIS_CONNECT_TIMEOUT_MS',
    process.env.REDIS_CONNECT_TIMEOUT_MS,
    3_000,
    500,
    30_000,
  ),
  redisChannel: process.env.REDIS_CHANNEL?.trim() || 'slspot:realtime:v1',
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX?.trim() || 'slspot:',
  websocketMaxPayloadBytes: parsePositiveInteger(
    'WEBSOCKET_MAX_PAYLOAD_BYTES',
    process.env.WEBSOCKET_MAX_PAYLOAD_BYTES,
    1_048_576,
    1_024,
    10_485_760,
  ),
} as const
