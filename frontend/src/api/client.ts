const DEFAULT_API_BASE_URL = '/api/v1'
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

export type ApiRequestOptions = RequestInit & {
  timeoutMs?: number
  requestId?: string
  idempotencyKey?: string
}

export type ApiErrorPayload = {
  code?: string
  message?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  readonly requestId?: string

  constructor(status: number, message: string, code?: string, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '')

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

export async function apiRequest<T>(
  path: string,
  init: ApiRequestOptions = {},
): Promise<T> {
  const {
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    requestId = createRequestId(),
    idempotencyKey,
    signal: callerSignal,
    ...requestInit
  } = init

  const url = path.startsWith('http')
    ? path
    : apiBaseUrl + (path.startsWith('/') ? path : '/' + path)

  const controller = new AbortController()
  const forwardAbort = () => controller.abort()
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort()
    } else {
      callerSignal.addEventListener('abort', forwardAbort, { once: true })
    }
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

    if (!response.ok) {
      if (response.status === 401) {
        window.dispatchEvent(new Event('slspot:auth-expired'))
      }

      const payload = body as {
        error?: ApiErrorPayload
        message?: string
        requestId?: string
      } | null
      const message =
        payload?.error?.message ??
        payload?.message ??
        'Request failed with status ' + response.status

      throw new ApiError(
        response.status,
        message,
        payload?.error?.code,
        payload?.requestId,
      )
    }

    return body as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      if (callerSignal?.aborted) {
        throw error
      }

      throw new ApiError(408, 'The request timed out', 'REQUEST_TIMEOUT', requestId)
    }

    throw error
  } finally {
    window.clearTimeout(timeoutId)
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
