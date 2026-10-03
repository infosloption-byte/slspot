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

function createRequestId(): string {
  return crypto.randomUUID()
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
    signal: callerSignal,
    ...requestInit
  } = init

  const url = path.startsWith('http')
    ? path
    : apiBaseUrl + (path.startsWith('/') ? path : '/' + path)
  const method = String(requestInit.method ?? 'GET').toUpperCase()
  const retryAllowed = requestCanRetry(method, idempotencyKey)
  const requestedAttempts = typeof retry === 'object' ? retry.maxAttempts ?? 3 : retry === false ? 1 : 3
  const maxAttempts = retryAllowed ? Math.max(1, Math.min(4, requestedAttempts)) : 1

  if (callerSignal?.aborted) {
    throw new DOMException('The operation was aborted', 'AbortError')
  }

  emitNetworkEvent('start')

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
            'x-request-id': requestId,
            ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
            ...requestInit.headers,
          },
        })
        const body = await readResponseBody(response)

        if (response.ok) return body as T

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
    callerSignal?.removeEventListener('abort', forwardAbort)
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
