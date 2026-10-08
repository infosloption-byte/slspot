import 'dotenv/config'

const NODE_ENVS = ['development', 'test', 'production'] as const
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const
const AUTH_SAME_SITE_VALUES = ['lax', 'strict', 'none'] as const

type NodeEnv = (typeof NODE_ENVS)[number]
type LogLevel = (typeof LOG_LEVELS)[number]
type AuthSameSite = (typeof AUTH_SAME_SITE_VALUES)[number]

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

function parseAuthSameSite(value: string | undefined, nodeEnv: NodeEnv): AuthSameSite {
  const sameSite = (value ?? (nodeEnv === 'production' ? 'strict' : 'lax')).trim().toLowerCase()
  if (!AUTH_SAME_SITE_VALUES.includes(sameSite as AuthSameSite)) {
    throw new Error('AUTH_COOKIE_SAMESITE must be lax, strict, or none')
  }
  return sameSite as AuthSameSite
}
function parseCookieName(value: string | undefined, nodeEnv: NodeEnv, defaultName: string): string {
  const name = value?.trim() || defaultName
  if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/.test(name)) {
    throw new Error('Cookie name must be a valid cookie name')
  }
  if (nodeEnv === 'production' && !name.startsWith('__Host-')) {
    throw new Error('Production authentication/CSRF cookies must use the __Host- prefix')
  }
  return name
}
function parseBoolean(name: string, value: string | undefined, fallback: boolean): boolean {
  const normalized = (value ?? String(fallback)).trim().toLowerCase()

  if (normalized === 'true') return true
  if (normalized === 'false') return false

  throw new Error(name + ' must be true or false')
}

function parseHexSecret(name: string, value: string | undefined, nodeEnv: NodeEnv): string {
  const fallback = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
  const secret = (value ?? fallback).trim().toLowerCase()
  if (nodeEnv === 'production' && value === undefined) {
    throw new Error(name + ' must be explicitly configured in production')
  }
  if (!/^[0-9a-f]{64}$/.test(secret)) {
    throw new Error(name + ' must be a 32-byte secret encoded as 64 hexadecimal characters')
  }
  return secret
}

function parseDecimalString(
  name: string,
  value: string | undefined,
  fallback: string,
): string {
  const normalized = (value ?? fallback).trim()
  if (!/^\d{1,20}(?:\.\d{1,8})?$/.test(normalized)) {
    throw new Error(name + ' must be a non-negative decimal with up to 8 fractional digits')
  }
  return normalized
}

function parseMarketProvider(value: string | undefined): 'disabled' | 'binance' {
  const provider = (value ?? 'binance').trim().toLowerCase()
  // 'multi-exchange' was the short-lived Binance/Kraken/OKX mode; it now means Binance only.
  if (provider === 'multi-exchange') return 'binance'
  if (provider !== 'disabled' && provider !== 'binance') {
    throw new Error('MARKET_DATA_PROVIDER must be binance or disabled (twelve-data, kraken and okx are no longer supported)')
  }
  return provider
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
  const fallback = 'mysql://slspot:slspot@127.0.0.1:3306/slspot'
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

  if (!['redis:', 'rediss:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('REDIS_URL must use redis:// or rediss:// and include a host')
  }

  if (parsed.port && (!Number.isInteger(Number(parsed.port)) || Number(parsed.port) < 1 || Number(parsed.port) > 65_535)) {
    throw new Error('REDIS_URL contains an invalid Redis port')
  }

  return parsed.toString()
}

function parseCorsOrigins(value: string | undefined, nodeEnv: NodeEnv): string[] {
  if (nodeEnv === 'production' && value === undefined) {
    throw new Error('CORS_ORIGIN must be explicitly configured in production')
  }

  const rawOrigins = (value ?? 'http://localhost:5173,http://localhost:5174')
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

  return [...new Set(origins)]
}

const nodeEnv = parseNodeEnv(process.env.NODE_ENV)
const database = parseDatabaseUrl(process.env.DATABASE_URL, nodeEnv)
const redisUrl = parseRedisUrl(process.env.REDIS_URL, nodeEnv)
const authCookieSecure = parseBoolean(
  'AUTH_COOKIE_SECURE',
  process.env.AUTH_COOKIE_SECURE,
  nodeEnv === 'production',
)
const exposeDevTokens = parseBoolean(
  'AUTH_EXPOSE_DEV_TOKENS',
  process.env.AUTH_EXPOSE_DEV_TOKENS,
  false,
)
const marketDataProvider = parseMarketProvider(process.env.MARKET_DATA_PROVIDER)
const marketDataEnabled = parseBoolean('MARKET_DATA_ENABLED', process.env.MARKET_DATA_ENABLED, marketDataProvider !== 'disabled')
const marketDataBootstrapAssets = parseBoolean('MARKET_DATA_BOOTSTRAP_ASSETS', process.env.MARKET_DATA_BOOTSTRAP_ASSETS, nodeEnv !== 'production')
// Simulated prices keep the DEMO market usable when no live feed is configured or the feed is
// failing (missing/rate-limited API key). Never allowed in production.
const marketDataSimulate = parseBoolean('MARKET_DATA_SIMULATE', process.env.MARKET_DATA_SIMULATE, false)
// Crypto is priced from Binance only (no cross-exchange failover, so a trade never mixes price sources).
const binanceEnabled = parseBoolean('BINANCE_ENABLED', process.env.BINANCE_ENABLED, marketDataProvider !== 'disabled')
const binanceRestUrl = (process.env.BINANCE_REST_URL?.trim() || 'https://api.binance.com').replace(/\/$/, '')
const binanceWsUrl = (process.env.BINANCE_WS_URL?.trim() || 'wss://stream.binance.com:9443').replace(/\/$/, '')
const adminBootstrapEmails = [...new Set((process.env.ADMIN_BOOTSTRAP_EMAILS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean))]
const authCookieName = parseCookieName(process.env.AUTH_COOKIE_NAME, nodeEnv, nodeEnv === 'production' ? '__Host-slspot_session' : 'slspot_session')
const csrfCookieName = parseCookieName(process.env.CSRF_COOKIE_NAME, nodeEnv, nodeEnv === 'production' ? '__Host-slspot_csrf' : 'slspot_csrf')
const csrfSecret = parseHexSecret('CSRF_SECRET', process.env.CSRF_SECRET, nodeEnv)
const webhookSigningSecret = parseHexSecret('WEBHOOK_SIGNING_SECRET', process.env.WEBHOOK_SIGNING_SECRET, nodeEnv)

if (nodeEnv === 'production' && !authCookieSecure) {
  throw new Error('AUTH_COOKIE_SECURE must be true in production')
}

if (nodeEnv === 'production' && exposeDevTokens) {
  throw new Error('AUTH_EXPOSE_DEV_TOKENS must be false in production')
}

if (nodeEnv === 'production' && process.env.AUTH_COOKIE_DOMAIN?.trim()) {
  throw new Error('AUTH_COOKIE_DOMAIN must not be set in production; use host-only __Host- cookies')
}

if (process.env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase() === 'none' && !authCookieSecure) {
  throw new Error('AUTH_COOKIE_SAMESITE=none requires AUTH_COOKIE_SECURE=true')
}

if (nodeEnv === 'production' && marketDataSimulate) {
  throw new Error('MARKET_DATA_SIMULATE must be false in production')
}


export const env = {
  nodeEnv,
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
  host: process.env.HOST?.trim() || '0.0.0.0',
  port: parsePort(process.env.PORT),
  requestTimeoutMs: parsePositiveInteger('REQUEST_TIMEOUT_MS', process.env.REQUEST_TIMEOUT_MS, 30_000, 1_000, 120_000),
  trustProxy: parseBoolean('TRUST_PROXY', process.env.TRUST_PROXY, false),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGIN, nodeEnv),
  shutdownTimeoutMs: parsePositiveInteger(
    'SHUTDOWN_TIMEOUT_MS',
    process.env.SHUTDOWN_TIMEOUT_MS,
    10_000,
    1_000,
    30_000,
  ),
  adminBootstrapEmails,
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
  marketData: {
    provider: marketDataProvider,
    enabled: marketDataEnabled,
    pollIntervalMs: parsePositiveInteger('MARKET_DATA_POLL_INTERVAL_MS', process.env.MARKET_DATA_POLL_INTERVAL_MS, 15_000, 5_000, 300_000),
    requestTimeoutMs: parsePositiveInteger('MARKET_DATA_REQUEST_TIMEOUT_MS', process.env.MARKET_DATA_REQUEST_TIMEOUT_MS, 10_000, 1_000, 60_000),
    bootstrapAssets: marketDataBootstrapAssets,
    simulate: marketDataSimulate,
    binance: { enabled: binanceEnabled, restUrl: binanceRestUrl, wsUrl: binanceWsUrl },
  },
  trading: {
    feeRate: parseDecimalString('TRADING_FEE_RATE', process.env.TRADING_FEE_RATE, '0'),
    initialBalance: parseDecimalString(
      'TRADING_INITIAL_BALANCE',
      process.env.TRADING_INITIAL_BALANCE,
      '12480.65',
    ),
    maxOpenPositions: parsePositiveInteger('TRADING_MAX_OPEN_POSITIONS', process.env.TRADING_MAX_OPEN_POSITIONS, 20, 1, 1_000),
    maxOpenExposure: parseDecimalString('TRADING_MAX_OPEN_EXPOSURE', process.env.TRADING_MAX_OPEN_EXPOSURE, '100000'),
    marketMaxAgeMs: parsePositiveInteger('TRADING_MARKET_MAX_AGE_MS', process.env.TRADING_MARKET_MAX_AGE_MS, 10_000, 1_000, 3_600_000),
    settlementIntervalMs: parsePositiveInteger('TRADING_SETTLEMENT_INTERVAL_MS', process.env.TRADING_SETTLEMENT_INTERVAL_MS, 1_000, 250, 60_000),
    // 0 disables the scheduled wallet/ledger reconciliation.
    reconcileIntervalMs: parsePositiveInteger('LEDGER_RECONCILE_INTERVAL_MS', process.env.LEDGER_RECONCILE_INTERVAL_MS, 900_000, 0, 86_400_000),
  },
  security: {
    csrfSecret,
    webhookSigningSecret,
    rateLimit: {
      generalLimit: parsePositiveInteger('RATE_LIMIT_GENERAL_LIMIT', process.env.RATE_LIMIT_GENERAL_LIMIT, 120, 30, 1000),
      generalWindowSeconds: parsePositiveInteger('RATE_LIMIT_GENERAL_WINDOW_SECONDS', process.env.RATE_LIMIT_GENERAL_WINDOW_SECONDS, 60, 10, 3600),
      authLimit: parsePositiveInteger('RATE_LIMIT_AUTH_LIMIT', process.env.RATE_LIMIT_AUTH_LIMIT, 10, 3, 100),
      authWindowSeconds: parsePositiveInteger('RATE_LIMIT_AUTH_WINDOW_SECONDS', process.env.RATE_LIMIT_AUTH_WINDOW_SECONDS, 300, 30, 3600),
      tradingLimit: parsePositiveInteger('RATE_LIMIT_TRADING_LIMIT', process.env.RATE_LIMIT_TRADING_LIMIT, 30, 5, 300),
      tradingWindowSeconds: parsePositiveInteger('RATE_LIMIT_TRADING_WINDOW_SECONDS', process.env.RATE_LIMIT_TRADING_WINDOW_SECONDS, 60, 10, 3600),
    },
  },
  websocketMaxPayloadBytes: parsePositiveInteger(
    'WEBSOCKET_MAX_PAYLOAD_BYTES',
    process.env.WEBSOCKET_MAX_PAYLOAD_BYTES,
    1_048_576,
    1_024,
    10_485_760,
  ),
  auth: {
    sessionTtlSeconds: parsePositiveInteger('AUTH_SESSION_TTL_SECONDS', process.env.AUTH_SESSION_TTL_SECONDS, 2_592_000, 900, 7_776_000),
    shortSessionTtlSeconds: parsePositiveInteger('AUTH_SHORT_SESSION_TTL_SECONDS', process.env.AUTH_SHORT_SESSION_TTL_SECONDS, 43_200, 900, 2_592_000),
    loginMaxAttempts: parsePositiveInteger('AUTH_LOGIN_MAX_ATTEMPTS', process.env.AUTH_LOGIN_MAX_ATTEMPTS, 5, 3, 20),
    loginLockSeconds: parsePositiveInteger('AUTH_LOGIN_LOCK_SECONDS', process.env.AUTH_LOGIN_LOCK_SECONDS, 900, 60, 86_400),
    twoFactorChallengeTtlSeconds: parsePositiveInteger('AUTH_2FA_CHALLENGE_TTL_SECONDS', process.env.AUTH_2FA_CHALLENGE_TTL_SECONDS, 300, 60, 900),
    twoFactorMaxAttempts: parsePositiveInteger('AUTH_2FA_MAX_ATTEMPTS', process.env.AUTH_2FA_MAX_ATTEMPTS, 5, 3, 10),
    twoFactorEncryptionKey: parseHexSecret('AUTH_2FA_ENCRYPTION_KEY', process.env.AUTH_2FA_ENCRYPTION_KEY, nodeEnv),
    verificationTtlSeconds: parsePositiveInteger('AUTH_VERIFICATION_TTL_SECONDS', process.env.AUTH_VERIFICATION_TTL_SECONDS, 86_400, 600, 604_800),
    passwordResetTtlSeconds: parsePositiveInteger('AUTH_PASSWORD_RESET_TTL_SECONDS', process.env.AUTH_PASSWORD_RESET_TTL_SECONDS, 3_600, 600, 86_400),
    passwordMinLength: parsePositiveInteger('AUTH_PASSWORD_MIN_LENGTH', process.env.AUTH_PASSWORD_MIN_LENGTH, 12, 10, 128),
    cookieName: authCookieName,
    csrfCookieName,
    cookieSameSite: parseAuthSameSite(process.env.AUTH_COOKIE_SAMESITE, nodeEnv),
    cookieSecure: authCookieSecure,
    exposeDevTokens,
  },
} as const
