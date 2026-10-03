import test from 'node:test'
import assert from 'node:assert/strict'
import { createWebhookSignature, verifyWebhookSignature } from './webhook.js'

test('webhook signature verifies the exact signed payload', () => {
  const secret = 'a'.repeat(64)
  const timestamp = String(Math.floor(Date.now() / 1000))
  const rawBody = '{"event":"payment.completed"}'
  const signature = createWebhookSignature(secret, timestamp, rawBody)

  assert.doesNotThrow(() => verifyWebhookSignature({
    rawBody,
    signature,
    timestamp,
    secret,
  }))
  assert.throws(() => verifyWebhookSignature({
    rawBody: '{"event":"payment.failed"}',
    signature,
    timestamp,
    secret,
  }))
})

test('webhook signature rejects stale timestamps', () => {
  const secret = 'a'.repeat(64)
  const timestamp = String(Math.floor(Date.now() / 1000) - 600)
  const rawBody = '{}'
  const signature = createWebhookSignature(secret, timestamp, rawBody)

  assert.throws(() => verifyWebhookSignature({
    rawBody,
    signature,
    timestamp,
    secret,
  }))
})
