import test from 'node:test'
import assert from 'node:assert/strict'
import { createCsrfToken, verifyCsrfToken } from './csrf.js'

test('csrf token is bound to the session cookie value', () => {
  const token = createCsrfToken('session-secret')
  assert.equal(verifyCsrfToken(token, 'session-secret'), true)
  assert.equal(verifyCsrfToken(token, 'different-session'), false)
})

test('csrf token rejects tampering and missing values', () => {
  const token = createCsrfToken('session-secret')
  const parts = token.split('.')
  parts[2] = 'tampered'
  assert.equal(verifyCsrfToken(parts.join('.'), 'session-secret'), false)
  assert.equal(verifyCsrfToken(undefined, 'session-secret'), false)
})
