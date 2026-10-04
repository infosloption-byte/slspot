import assert from 'node:assert/strict'
import { beforeEach, afterEach, describe, it } from 'node:test'
import { ApiError, apiRequest, resetCsrfToken } from './client'
import { marketApi } from './market'
import { portfolioApi } from './portfolio'
import { tradesApi } from './trades'
import { walletApi } from './wallet'
import { notificationsApi } from './notifications'

const originalFetch = globalThis.fetch

function installWindow() {
  const target = new EventTarget()
  const fakeWindow = {
    setTimeout,
    clearTimeout,
    dispatchEvent: (event: Event) => target.dispatchEvent(event),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
  }
  Object.assign(globalThis, { window: fakeWindow })
}

beforeEach(() => {
  installWindow()
  resetCsrfToken()
})
afterEach(() => {
  globalThis.fetch = originalFetch
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/**
 * Serves /auth/csrf with a fresh token each call and forwards every other request to `handler`.
 * Unsafe requests need a CSRF token, so any POST test has to provide one.
 */
function installFetch(handler: (url: string, init: RequestInit | undefined, csrfFetches: number) => Response | Promise<Response>) {
  let csrfFetches = 0
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    if (url.endsWith('/auth/csrf')) {
      csrfFetches += 1
      return json({ success: true, data: { csrfToken: 'token-' + csrfFetches }, requestId: 'csrf' })
    }
    return handler(url, init, csrfFetches)
  }
  return { csrfFetches: () => csrfFetches }
}

describe('frontend API bindings', () => {
  it('binds market asset queries and pagination', async () => {
    let requestedUrl = ''
    globalThis.fetch = async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({
        success: true,
        data: { items: [], pagination: { page: 2, pageSize: 10, total: 0, totalPages: 1 } },
        requestId: 'request-1',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const result = await marketApi.listAssets({ page: 2, pageSize: 10 })
    assert.match(requestedUrl, /\/market\/assets\?page=2&pageSize=10$/)
    assert.equal(result.pagination.pageSize, 10)
  })

  it('binds authenticated read domains to their server endpoints', async () => {
    const urls: string[] = []
    globalThis.fetch = async (input) => {
      urls.push(String(input))
      return new Response(JSON.stringify({
        success: true,
        data: {
          currency: 'USD',
          availableBalance: '100',
          heldBalance: '0',
          totalBalance: '100',
          openPositionCount: 0,
          tradeCount: 0,
          netPnl: '0',
          items: [],
          pagination: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
        },
        requestId: 'request-1',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    await portfolioApi.summary()
    await portfolioApi.positions({ page: 1, pageSize: 25 })
    await tradesApi.list({ page: 1, pageSize: 25 })
    await walletApi.list()
    await walletApi.get()
    await walletApi.transactions({ page: 1, pageSize: 25 })
    await notificationsApi.list({ page: 1, pageSize: 25 })

    assert.ok(urls.some((url) => url.endsWith('/portfolio/summary')))
    assert.ok(urls.some((url) => url.includes('/portfolio/positions?page=1&pageSize=25')))
    assert.ok(urls.some((url) => url.includes('/trades?page=1&pageSize=25')))
    assert.ok(urls.some((url) => url.endsWith('/wallets')))
    assert.ok(urls.some((url) => url.endsWith('/wallet')))
    assert.ok(urls.some((url) => url.includes('/wallet/transactions?page=1&pageSize=25')))
    assert.ok(urls.some((url) => url.includes('/notifications?page=1&pageSize=25')))
  })

  it('loads server-authoritative account capabilities', async () => {
    let requestedUrl = ''
    globalThis.fetch = async (input) => {
      requestedUrl = String(input)
      return new Response(JSON.stringify({
        success: true,
        data: {
          trading: {
            DEMO: { enabled: true, reason: null },
            REAL: { enabled: false, reason: 'Real trading is not enabled' },
          },
          funding: {
            deposit: {
              DEMO: { enabled: true, reason: null },
              REAL: { enabled: false, reason: 'Real deposits are not enabled' },
            },
            withdrawal: {
              DEMO: { enabled: true, reason: null },
              REAL: { enabled: false, reason: 'Real withdrawals are not enabled' },
            },
          },
        },
        requestId: 'request-1',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    const { authApi } = await import('./auth')
    const result = await authApi.capabilities()
    assert.match(requestedUrl, /\/auth\/capabilities$/)
    assert.equal(result.trading.DEMO.enabled, true)
    assert.equal(result.trading.REAL.enabled, false)
  })

  it('sends the selected wallet mode to account-scoped APIs', async () => {
    let modeHeader = ''
    globalThis.fetch = async (_input, init) => {
      modeHeader = new Headers(init?.headers).get('x-wallet-mode') ?? ''
      return new Response(JSON.stringify({
        success: true,
        data: { currency: 'USD', availableBalance: '100', heldBalance: '0', totalBalance: '100', openPositionCount: 0, tradeCount: 0, netPnl: '0' },
        requestId: 'request-1',
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }

    await walletApi.get('REAL')
    assert.equal(modeHeader, 'REAL')
  })

  it('keeps bodyless POSTs free of a JSON content type', async () => {
    let contentType: string | null = null
    installFetch((_url, init) => {
      contentType = new Headers(init?.headers).get('content-type')
      return json({ success: true, data: { read: true }, requestId: 'request-1' })
    })

    await notificationsApi.markRead('notification-1')
    assert.equal(contentType, null)
  })

  it('retries safe GET requests after transient server errors', async () => {
    let attempts = 0
    globalThis.fetch = async () => {
      attempts += 1
      if (attempts < 2) {
        return new Response(JSON.stringify({ success: false, error: { code: 'TEMPORARY', message: 'Try again' }, requestId: 'request-1' }), {
          status: 503,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ success: true, data: { ok: true }, requestId: 'request-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    const result = await apiRequest<{ success: boolean }>('/ready')
    assert.equal(result.success, true)
    assert.equal(attempts, 2)
  })

  it('does not retry a non-idempotent POST without an idempotency key', async () => {
    let attempts = 0
    installFetch(() => {
      attempts += 1
      return json({ success: false, error: { code: 'TEMPORARY', message: 'Try again' }, requestId: 'request-1' }, 503)
    })

    await assert.rejects(
      () => apiRequest('/trades', { method: 'POST', body: '{}', timeoutMs: 100 }),
      /Try again/,
    )
    assert.equal(attempts, 1)
  })

  it('refreshes the CSRF token and re-sends a non-retryable POST once', async () => {
    const sentTokens: Array<string | null> = []
    const fetches = installFetch((_url, init) => {
      const token = new Headers(init?.headers).get('x-csrf-token')
      sentTokens.push(token)
      // The first token is rejected (stale after logout/login); the refreshed one is accepted.
      if (token === 'token-1') {
        return json({ success: false, error: { code: 'CSRF_INVALID', message: 'Invalid CSRF token' }, requestId: 'r' }, 403)
      }
      return json({ success: true, data: { loggedOut: true }, requestId: 'r' })
    })

    const result = await apiRequest<{ success: boolean }>('/auth/logout', { method: 'POST' })

    assert.equal(result.success, true)
    assert.deepEqual(sentTokens, ['token-1', 'token-2'])
    assert.equal(fetches.csrfFetches(), 2)
  })

  it('gives up after a single CSRF refresh and reports the CSRF error', async () => {
    let attempts = 0
    installFetch(() => {
      attempts += 1
      return json({ success: false, error: { code: 'CSRF_INVALID', message: 'Invalid CSRF token' }, requestId: 'r' }, 403)
    })

    await assert.rejects(
      () => apiRequest('/auth/logout', { method: 'POST' }),
      (error: unknown) => error instanceof ApiError && error.code === 'CSRF_INVALID',
    )
    assert.equal(attempts, 2)
  })

})
