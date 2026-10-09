import assert from 'node:assert/strict'
import test from 'node:test'
import { env } from '../config/env.js'
import { buildApp } from '../app.js'

test('local email preview pages are rendered only for development loopback requests', {
  skip: env.nodeEnv !== 'development',
}, async () => {
  const app = buildApp({ logging: false })
  await app.ready()

  const index = await app.inject({ method: 'GET', url: '/api/v1/dev/email-previews' })
  assert.equal(index.statusCode, 200)
  assert.match(index.headers['content-type'] ?? '', /text\/html/)
  assert.match(index.headers['content-security-policy'] ?? '', /style-src 'unsafe-inline'/)
  assert.match(index.body, /Template library/)
  assert.match(index.body, /Deposit successful/)
  assert.match(index.body, /Captured local outbox/)

  const sample = await app.inject({ method: 'GET', url: '/api/v1/dev/email-previews/templates/withdrawal-success' })
  assert.equal(sample.statusCode, 200)
  assert.match(sample.body, /Withdrawal completed/)
  assert.match(sample.body, /SL SPOT/)

  const invalid = await app.inject({ method: 'GET', url: '/api/v1/dev/email-previews/templates/not-a-template' })
  assert.equal(invalid.statusCode, 404)

  await app.close()
})
