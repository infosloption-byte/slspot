const DEFAULT_API_BASE_URL = '/api/v1'
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number
  requestId?: string
  idempotencyKey?: string
  retry?: boolean | { maxAttempts?: number }
}

export type ApiErrorPayload = {
  code?: string
  message?: string
}

function emitNetworkEvent(type: 'start' | 'end'): void {
  window.dispatchEvent(new Event(type === 'start' ? 'slspot:network-start' : 'slspot:network-end'))
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string
  readonly retryAfterSeconds?: number

  constructor(status: number, message: string, code?: string, requestId?: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.retryAfterSeconds = retryAfterSeconds
  }
}

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
const apiBaseUrl = (viteEnv?.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '')

/**
 * Resolved lazily. Reading `window.location` at import time throws anywhere that
 * has no browser globals yet (unit tests, SSR) and made the whole module unimportable.
 */
function currentOrigin(): string {
  const location = (globalThis as { location?: { origin?: string } }).location
  return location?.origin ?? 'http://localhost'
}

function getApiOrigin(): string {
  return new URL(apiBaseUrl, currentOrigin()).origin
}

function createRequestId(): string {
  return crypto.randomUUID()
}

/** Clears the cached CSRF token. Used when the session changes and by tests. */
export function resetCsrfToken(): void {
  csrfToken = null
  csrfFetchPromise = null
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
let csrfToken: string | null = null
let csrfFetchPromise: Promise<string | null> | null = null

function isUnsafeMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase())
}

function extractCsrfToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const data = (body as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const token = (data as { csrfToken?: unknown }).csrfToken
  return typeof token === 'string' && token.length > 0 ? token : null
}

async function ensureCsrfToken(): Promise<string | null> {
  if (csrfToken) return csrfToken
  if (csrfFetchPromise) return csrfFetchPromise

  csrfFetchPromise = (async () => {
    try {
      const response = await fetch(apiBaseUrl + '/auth/csrf', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json', 'x-request-id': createRequestId() },
      })
      const body = await readResponseBody(response)
      if (!response.ok) return null
      csrfToken = extractCsrfToken(body)
      return csrfToken
    } catch {
      return null
    } finally {
      csrfFetchPromise = null
    }
  })()

  return csrfFetchPromise
}

async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    return response.json()
  }

  const text = await response.text()
  return text ? { message: text } : null
}

function requestCanRetry(method: string, idempotencyKey?: string): boolean {
  const normalized = method.toUpperCase()
  return normalized === 'GET' || normalized === 'HEAD' || normalized === 'OPTIONS' || Boolean(idempotencyKey)
}

function statusCanRetry(status: number): boolean {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function retryDelayMs(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined) return Math.min(10_000, Math.max(0, retryAfterSeconds * 1000))
  return Math.min(4_000, 250 * Math.pow(2, attempt - 1))
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)
    const abort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('The operation was aborted', 'AbortError'))
    }
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener('abort', abort, { once: true })
  })
}

export async function apiRequest<T>(
  path: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    requestId = createRequestId(),
    idempotencyKey,
    retry,
    signal: callerSignalInput,
    ...requestInit
  } = init
  const callerSignal = callerSignalInput ?? undefined

  const url = path.startsWith('http')
    ? path
    : apiBaseUrl + (path.startsWith('/') ? path : '/' + path)
  const method = String(requestInit.method ?? 'GET').toUpperCase()
  const requestOrigin = new URL(url, currentOrigin()).origin
  const usesApiSecurity = requestOrigin === getApiOrigin()
  if (!usesApiSecurity && isUnsafeMethod(method)) {
    throw new ApiError(400, 'Unsafe cross-origin API requests are not permitted', 'CROSS_ORIGIN_REQUEST_BLOCKED', requestId)
  }
  const retryAllowed = requestCanRetry(method, idempotencyKey)
  const requestedAttempts = typeof retry === 'object' ? retry.maxAttempts ?? 3 : retry === false ? 1 : 3
  const maxAttempts = retryAllowed ? Math.max(1, Math.min(4, requestedAttempts)) : 1
  let csrfRetryUsed = false

  if (callerSignal?.aborted) {
    throw new DOMException('The operation was aborted', 'AbortError')
  }

  emitNetworkEvent('start')

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (isUnsafeMethod(method) && usesApiSecurity && !url.endsWith('/auth/csrf')) {
        const token = await ensureCsrfToken()
        if (!token) {
          throw new ApiError(403, 'CSRF protection token is unavailable', 'CSRF_UNAVAILABLE', requestId)
        }
      }

      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      if (callerSignal) {
        callerSignal.addEventListener('abort', forwardAbort, { once: true })
      }
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)
      try {
        const hasBody = requestInit.body !== undefined && requestInit.body !== null
        const response = await fetch(url, {
          ...requestInit,
          signal: controller.signal,
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            ...(isUnsafeMethod(method) && usesApiSecurity && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            'x-request-id': requestId,
            ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
            ...requestInit.headers,
          },
        })
        const body = await readResponseBody(response)

        if (response.ok) {
          const responseCsrfToken = extractCsrfToken(body)
          if (responseCsrfToken) csrfToken = responseCsrfToken
          return body as T
        }

        if (response.status === 401) {
          window.dispatchEvent(new Event('slspot:auth-expired'))
        }

        const payload = body as {
          error?: ApiErrorPayload
          message?: string
          requestId?: string
        } | null
        const retryAfterSeconds = (() => {
          const value = Number(response.headers.get('retry-after'))
          return Number.isFinite(value) && value > 0 ? value : undefined
        })()
        const message =
          payload?.error?.message ??
          payload?.message ??
          'Request failed with status ' + response.status

        const error = new ApiError(
          response.status,
          message,
          payload?.error?.code,
          payload?.requestId,
          retryAfterSeconds,
        )

        if (isUnsafeMethod(method) && usesApiSecurity && error.code === 'CSRF_INVALID' && !csrfRetryUsed) {
          csrfRetryUsed = true
          csrfToken = null
          await ensureCsrfToken()
          // Refreshing the token is not a failed attempt. Without this, a request that is
          // not retryable (maxAttempts = 1, e.g. login/logout/register) fell out of the loop
          // and surfaced as "Request retry limit reached" instead of being re-sent once.
          attempt -= 1
          continue
        }

        if (attempt < maxAttempts && statusCanRetry(response.status)) {
          await sleep(retryDelayMs(attempt, retryAfterSeconds), callerSignal)
          continue
        }

        throw error
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          if (callerSignal?.aborted) throw error
          if (attempt < maxAttempts) {
            await sleep(retryDelayMs(attempt), callerSignal)
            continue
          }
          throw new ApiError(408, 'The request timed out', 'REQUEST_TIMEOUT', requestId)
        }

        if (attempt < maxAttempts && error instanceof TypeError) {
          await sleep(retryDelayMs(attempt), callerSignal)
          continue
        }

        throw error
      } finally {
        window.clearTimeout(timeoutId)
        callerSignal?.removeEventListener('abort', forwardAbort)
      }
    }

    throw new ApiError(500, 'Request retry limit reached', 'REQUEST_RETRY_EXHAUSTED', requestId)
  } finally {
    emitNetworkEvent('end')
  }
}

export const apiClient = {
  get: <T>(path: string, init?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...init, method: 'GET' }),

  post: <T>(path: string, body?: unknown, init?: ApiRequestOptions) =>
    apiRequest<T>(path, {
      ...init,
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  put: <T>(path: string, body?: unknown, init?: ApiRequestOptions) =>
    apiRequest<T>(path, {
      ...init,
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  patch: <T>(path: string, body?: unknown, init?: ApiRequestOptions) =>
    apiRequest<T>(path, {
      ...init,
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  delete: <T>(path: string, init?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...init, method: 'DELETE' }),
}
