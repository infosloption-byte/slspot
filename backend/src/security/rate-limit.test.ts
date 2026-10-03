import test from 'node:test'
import assert from 'node:assert/strict'
import { enforceRateLimit, RateLimitError } from './rate-limit.js'

test('rate limiter blocks requests after the configured threshold', async () => {
  const key = 'test-' + Math.random().toString(36).slice(2)
  await enforceRateLimit({ key, limit: 2, windowSeconds: 60 })
  await enforceRateLimit({ key, limit: 2, windowSeconds: 60 })
  await assert.rejects(
    enforceRateLimit({ key, limit: 2, windowSeconds: 60 }),
    (error: unknown) => error instanceof RateLimitError && error.statusCode === 429,
  )
})
