export class AdminApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
    this.code = code
  }
}

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
const baseUrl = (env?.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')

let csrfToken: string | null = null
let csrfFetchPromise: Promise<string | null> | null = null

function extractCsrfToken(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const data = (body as { data?: unknown }).data
  if (!data || typeof data !== 'object') return null
  const token = (data as { csrfToken?: unknown }).csrfToken
  return typeof token === 'string' && token.length > 0 ? token : null
}

async function ensureCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken
  if (csrfFetchPromise) return csrfFetchPromise.then((value) => {
    if (!value) throw new AdminApiError(403, 'CSRF protection token is unavailable', 'CSRF_UNAVAILABLE')
    return value
  })

  csrfFetchPromise = (async () => {
    try {
      const response = await fetch(baseUrl + '/auth/csrf', {
        credentials: 'include',
        headers: { Accept: 'application/json', 'x-request-id': crypto.randomUUID() },
      })
      const body = await response.json().catch(() => null)
      csrfToken = response.ok ? extractCsrfToken(body) : null
      return csrfToken
    } finally {
      csrfFetchPromise = null
    }
  })()

  const token = await csrfFetchPromise
  if (!token) throw new AdminApiError(403, 'CSRF protection token is unavailable', 'CSRF_UNAVAILABLE')
  return token
}

async function request<T>(path: string, init: RequestInit = {
  const method = String(init.method ?? 'GET').toUpperCase()
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method)

  if (unsafe) await ensureCsrfToken()

  const response = await fetch(baseUrl + (path.startsWith('/') ? path : '/' + path), {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(unsafe && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      'x-request-id': crypto.randomUUID(),
      ...init.headers,
    },
  })
  const body = await response.json().catch(() => null) as { success?: boolean; data?: T & { csrfToken?: string }; error?: { code?: string; message?: string } } | null
  if (!response.ok || body?.success === false) {
    if (unsafe && body?.error?.code === 'CSRF_INVALID') {
      csrfToken = null
      const refreshed = await ensureCsrfToken()
      return request<T>(path, { ...init, headers: { ...init.headers, 'x-csrf-token': refreshed } })
    }
    throw new AdminApiError(response.status, body?.error?.message || 'Request failed', body?.error?.code)
  }
  const responseCsrfToken = extractCsrfToken(body)
  if (responseCsrfToken) csrfToken = responseCsrfToken
  return body?.data as T
}
