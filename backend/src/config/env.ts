import 'dotenv/config'
import { randomBytes } from 'node:crypto'

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

function parseEmailProvider(value: string | undefined): 'disabled' | 'resend' {
  const provider = (value ?? 'disabled').trim().toLowerCase()
  if (provider !== 'disabled' && provider !== 'resend') {
    throw new Error('EMAIL_PROVIDER must be disabled or resend')
  }
  return provider
}

function parseUrl(name: string, value: string, requireHttps: boolean): string {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(name + ' must be a valid URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(name + ' must contain only a scheme, host and optional path')
  }
  if (requireHttps && parsed.protocol !== 'https:') {
    throw new Error(name + ' must use HTTPS in production')
  }
  return parsed.toString().replace(/\/$/, '')
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
const emailProvider = parseEmailProvider(process.env.EMAIL_PROVIDER)
const emailApiUrl = parseUrl('EMAIL_API_URL', process.env.EMAIL_API_URL?.trim() || 'https://api.resend.com', nodeEnv === 'production' && emailProvider !== 'disabled')
const emailApiKey = process.env.RESEND_API_KEY?.trim() || ''
const emailFrom = process.env.EMAIL_FROM?.trim() || ''
const emailAppBaseUrl = parseUrl('APP_BASE_URL', process.env.APP_BASE_URL?.trim() || 'http://localhost:5173', nodeEnv === 'production' && emailProvider !== 'disabled')

if (emailProvider !== 'disabled') {
  if (!emailApiKey) throw new Error('RESEND_API_KEY must be configured when EMAIL_PROVIDER=resend')
  if (!emailFrom || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailFrom.replace(/^.*<([^>]+)>.*$/, '$1'))) {
    throw new Error('EMAIL_FROM must be a valid sender address or display-name sender')
  }
  if (nodeEnv === 'production' && emailAppBaseUrl.startsWith('http://')) {
    throw new Error('APP_BASE_URL must use HTTPS in production when email is enabled')
  }
}
const marketDataProvider = parseMarketProvider(process.env.MARKET_DATA_PROVIDER)
const marketDataEnabled = parseBoolean('MARKET_DATA_ENABLED', process.env.MARKET_DATA_ENABLED, marketDataProvider !== 'disabled')
const marketDataBootstrapAssets = parseBoolean('MARKET_DATA_BOOTSTRAP_ASSETS', process.env.MARKET_DATA_BOOTSTRAP_ASSETS, nodeEnv !== 'production')
// Prices are never simulated (demo and real alike); fail loudly if an old config still asks for it.
if (parseBoolean('MARKET_DATA_SIMULATE', process.env.MARKET_DATA_SIMULATE, false)) {
  throw new Error('MARKET_DATA_SIMULATE is no longer supported: all prices come from the live exchange feed')
}
// Crypto is priced from Binance only (no cross-exchange failover, so a trade never mixes price sources).
// Sandbox payment providers fake the money movement (they credit wallets without real funds), so they may
// only exist outside production. They are what lets deposit/withdrawal flows be tested before real
// provider credentials exist.
const paymentsSandbox = parseBoolean('PAYMENTS_SANDBOX', process.env.PAYMENTS_SANDBOX, nodeEnv !== 'production')
if (paymentsSandbox && nodeEnv === 'production') {
  throw new Error('PAYMENTS_SANDBOX must not be enabled in production: sandbox providers credit wallets without real funds')
}
const paymentsRelaxChecks = parseBoolean('PAYMENTS_RELAX_WITHDRAWAL_CHECKS', process.env.PAYMENTS_RELAX_WITHDRAWAL_CHECKS, false)
if (paymentsRelaxChecks && nodeEnv === 'production') {
  throw new Error('PAYMENTS_RELAX_WITHDRAWAL_CHECKS must not be enabled in production')
}
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
  email: {
    provider: emailProvider,
    apiUrl: emailApiUrl,
    apiKey: emailApiKey,
    from: emailFrom,
    appBaseUrl: emailAppBaseUrl,
    requestTimeoutMs: parsePositiveInteger('EMAIL_REQUEST_TIMEOUT_MS', process.env.EMAIL_REQUEST_TIMEOUT_MS, 10_000, 1_000, 60_000),
  },
  marketData: {
    provider: marketDataProvider,
    enabled: marketDataEnabled,
    pollIntervalMs: parsePositiveInteger('MARKET_DATA_POLL_INTERVAL_MS', process.env.MARKET_DATA_POLL_INTERVAL_MS, 15_000, 5_000, 300_000),
    requestTimeoutMs: parsePositiveInteger('MARKET_DATA_REQUEST_TIMEOUT_MS', process.env.MARKET_DATA_REQUEST_TIMEOUT_MS, 10_000, 1_000, 60_000),
    bootstrapAssets: marketDataBootstrapAssets,
    binance: { enabled: binanceEnabled, restUrl: binanceRestUrl, wsUrl: binanceWsUrl },
  },
  // REAL-mode controls are fail-closed. The master approval flag and the
  // operation-specific flag must both be true. Funding routes remain disabled
  // until provider-backed workflows are implemented and reviewed.
  realMoney: {
    launchApproved: parseBoolean('REAL_MONEY_LAUNCH_APPROVED', process.env.REAL_MONEY_LAUNCH_APPROVED, false),
    tradingEnabled: parseBoolean('REAL_TRADING_ENABLED', process.env.REAL_TRADING_ENABLED, false),
    depositsEnabled: parseBoolean('REAL_DEPOSITS_ENABLED', process.env.REAL_DEPOSITS_ENABLED, false),
    withdrawalsEnabled: parseBoolean('REAL_WITHDRAWALS_ENABLED', process.env.REAL_WITHDRAWALS_ENABLED, false),
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
    // An expired real-money trade with no reliable price is voided and refunded after this long.
    voidAfterMs: parsePositiveInteger('TRADING_VOID_AFTER_MS', process.env.TRADING_VOID_AFTER_MS, 60_000, 10_000, 3_600_000),
    // 0 disables the scheduled wallet/ledger reconciliation.
    reconcileIntervalMs: parsePositiveInteger('LEDGER_RECONCILE_INTERVAL_MS', process.env.LEDGER_RECONCILE_INTERVAL_MS, 900_000, 0, 86_400_000),
  },
  payments: {
    sandbox: paymentsSandbox,
    // Secret used to sign sandbox webhooks. Random per boot unless set; only the sandbox uses it.
    sandboxWebhookSecret: process.env.PAYMENTS_SANDBOX_WEBHOOK_SECRET?.trim() || randomBytes(32).toString('hex'),
    // Local testing only: skips the KYC, 2FA, turnover and cooling-off withdrawal rules.
    relaxWithdrawalChecks: paymentsRelaxChecks,
    // Cumulative completed deposits allowed before ID verification (0 = no limit while limits are being designed).
    tier1DepositLimit: parseDecimalString('PAYMENTS_TIER1_DEPOSIT_LIMIT', process.env.PAYMENTS_TIER1_DEPOSIT_LIMIT, '0'),
    // Withdrawals at or above this amount wait for a manual admin review (0 = every withdrawal is reviewed).
    withdrawalReviewThreshold: parseDecimalString('PAYMENTS_WITHDRAWAL_REVIEW_THRESHOLD', process.env.PAYMENTS_WITHDRAWAL_REVIEW_THRESHOLD, '1000'),
    // Traded stake required before withdrawing, as a multiple of completed deposits (0 disables).
    withdrawalTurnoverMultiple: parseDecimalString('PAYMENTS_WITHDRAWAL_TURNOVER_MULTIPLE', process.env.PAYMENTS_WITHDRAWAL_TURNOVER_MULTIPLE, '1'),
    // Withdrawals are blocked this long after a password or 2FA change.
    withdrawalCoolingHours: parsePositiveInteger('PAYMENTS_WITHDRAWAL_COOLING_HOURS', process.env.PAYMENTS_WITHDRAWAL_COOLING_HOURS, 24, 0, 720),
    // A deposit that was never completed at the provider expires after this long.
    depositExpiryMinutes: parsePositiveInteger('PAYMENTS_DEPOSIT_EXPIRY_MINUTES', process.env.PAYMENTS_DEPOSIT_EXPIRY_MINUTES, 60, 5, 10_080),
    // Countries (ISO-2, comma separated) that may not use payments. Empty = open to everyone for now.
    blockedCountries: (process.env.PAYMENTS_BLOCKED_COUNTRIES ?? '').split(',').map((item) => item.trim().toUpperCase()).filter((item) => /^[A-Z]{2}$/.test(item)),
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
