import test from 'node:test'
import assert from 'node:assert/strict'
import { assertTrustedOrigin, assertTrustedWebSocketOrigin } from './origin.js'

test('trusted API origin is accepted for state-changing requests', () => {
  const request = {
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: 'http://localhost:5173' },
  } as never
  assert.doesNotThrow(() => assertTrustedOrigin(request))
})

test('untrusted API origin is rejected', () => {
  const request = {
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: 'https://evil.example' },
  } as never
  assert.throws(() => assertTrustedOrigin(request))
})

test('websocket connections require a trusted origin', () => {
  const trusted = {
    headers: { origin: 'http://localhost:5173', 'sec-fetch-site': 'same-origin' },
  } as never
  const crossSite = {
    headers: { origin: 'http://localhost:5173', 'sec-fetch-site': 'cross-site' },
  } as never
  assert.doesNotThrow(() => assertTrustedWebSocketOrigin(trusted))
  assert.throws(() => assertTrustedWebSocketOrigin(crossSite))
})
