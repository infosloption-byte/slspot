import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isValidIdempotencyKey,
  isValidRequestId,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from './api.js'

describe('API transport contracts', () => {
  it('accepts valid request ids and rejects unsafe values', () => {
    assert.equal(isValidRequestId('req-123_abc'), true)
    assert.equal(isValidRequestId(''), false)
    assert.equal(isValidRequestId('not valid'), false)
    assert.equal(isValidRequestId('x'.repeat(129)), false)
  })

  it('bounds idempotency keys', () => {
    assert.equal(isValidIdempotencyKey('trade-123'), true)
    assert.equal(isValidIdempotencyKey(''), false)
    assert.equal(isValidIdempotencyKey('x'.repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1)), false)
  })
})
