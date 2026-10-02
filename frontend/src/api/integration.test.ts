import assert from 'node:assert/strict'
import { beforeEach, afterEach, describe, it } from 'node:test'
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

beforeEach(() => installWindow())
afterEach(() => {
  globalThis.fetch = originalFetch
})

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
    await walletApi.get()
    await walletApi.transactions({ page: 1, pageSize: 25 })
    await notificationsApi.list({ page: 1, pageSize: 25 })

    assert.ok(urls.some((url) => url.endsWith('/portfolio/summary')))
    assert.ok(urls.some((url) => url.includes('/portfolio/positions?page=1&pageSize=25')))
    assert.ok(urls.some((url) => url.includes('/trades?page=1&pageSize=25')))
    assert.ok(urls.some((url) => url.endsWith('/wallet')))
    assert.ok(urls.some((url) => url.includes('/wallet/transactions?page=1&pageSize=25')))
    assert.ok(urls.some((url) => url.includes('/notifications?page=1&pageSize=25')))
  })

  it('keeps bodyless POSTs free of a JSON content type', async () => {
    let contentType: string | null = null
    globalThis.fetch = async (_input, init) => {
      contentType = new Headers(init?.headers).get('content-type')
      return new Response(JSON.stringify({ success: true, data: { read: true }, requestId: 'request-1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }

    await notificationsApi.markRead('notification-1')
    assert.equal(contentType, null)
  })
})
