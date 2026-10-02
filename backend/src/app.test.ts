import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { buildApp } from '../src/app.js'

describe('backend HTTP foundation', () => {
  const app = buildApp({ logging: false })

  app.get('/test/internal-error', async () => {
    throw new Error('test failure')
  })

  before(async () => {
    await app.ready()
  })

  after(async () => {
    await app.close()
  })

  it('returns a healthy API response', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    assert.equal(response.statusCode, 200)

    const body = response.json<{
      success: boolean
      data: {
        service: string
        version: string
        status: string
      }
      requestId: string
    }>()

    assert.equal(body.success, true)
    assert.equal(body.data.service, 'slspot-api')
    assert.equal(body.data.version, 'v1')
    assert.equal(body.data.status, 'ok')
    assert.match(body.requestId, /^[A-Za-z0-9._:-]{1,128}$/)
    assert.equal(response.headers['x-request-id'], body.requestId)
  })

  it('accepts a safe caller request id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
      headers: {
        'x-request-id': 'client-request-123',
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['x-request-id'], 'client-request-123')
    assert.equal(response.json<{ requestId: string }>().requestId, 'client-request-123')
  })

  it('replaces an unsafe caller request id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
      headers: {
        'x-request-id': 'bad id with spaces',
      },
    })

    assert.equal(response.statusCode, 200)
    assert.notEqual(response.headers['x-request-id'], 'bad id with spaces')
  })

  it('returns standard 404 responses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/does-not-exist',
    })

    assert.equal(response.statusCode, 404)

    const body = response.json<{
      success: boolean
      error: {
        code: string
        message: string
      }
      requestId: string
    }>()

    assert.equal(body.success, false)
    assert.equal(body.error.code, 'NOT_FOUND')
    assert.match(body.error.message, /GET \/api\/v1\/does-not-exist was not found/)
    assert.equal(body.requestId, response.headers['x-request-id'])
  })

  it('returns standard 500 responses for unexpected failures', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/internal-error',
    })

    assert.equal(response.statusCode, 500)

    const body = response.json<{
      success: boolean
      error: {
        code: string
        message: string
      }
      requestId: string
    }>()

    assert.equal(body.success, false)
    assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR')
    assert.equal(body.error.message, 'An unexpected server error occurred')
    assert.equal(body.requestId, response.headers['x-request-id'])
  })

  it('emits baseline API security headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    })

    assert.equal(response.headers['x-content-type-options'], 'nosniff')
    assert.equal(response.headers['x-frame-options'], 'DENY')
    assert.equal(response.headers['referrer-policy'], 'no-referrer')
    assert.equal(response.headers['permissions-policy'], 'camera=(), microphone=(), geolocation=()')
    assert.equal(response.headers['cache-control'], 'no-store')
  })

  it('allows the configured frontend origin with credentials', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: {
        origin: 'http://localhost:5173',
      },
    })

    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.equal(response.headers['access-control-allow-credentials'], 'true')
  })
})


describe('backend readiness dependencies', () => {
  it('reports optional redis as unavailable without failing readiness', async () => {
    const app = buildApp({
      logging: false,
      checkDatabase: async () => true,
      checkRedis: async () => false,
      redisRequired: false,
    })

    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    })

    assert.equal(response.statusCode, 200)

    const body = response.json<{
      success: boolean
      data: {
        status: string
        checks: {
          redis: string
        }
      }
    }>()

    assert.equal(body.data.status, 'ready')
    assert.equal(body.data.checks.redis, 'optional_unavailable')

    await app.close()
  })

  it('fails readiness when redis is required but unavailable', async () => {
    const app = buildApp({
      logging: false,
      checkDatabase: async () => true,
      checkRedis: async () => false,
      redisRequired: true,
    })

    await app.ready()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ready',
    })

    assert.equal(response.statusCode, 503)

    const body = response.json<{
      success: boolean
      data: {
        status: string
        checks: {
          redis: string
        }
      }
    }>()

    assert.equal(body.data.status, 'not_ready')
    assert.equal(body.data.checks.redis, 'unavailable')

    await app.close()
  })
})
