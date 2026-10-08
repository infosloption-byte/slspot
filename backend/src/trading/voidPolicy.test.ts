import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldVoidUnpricedTrade, voidNotification } from './voidPolicy.js'

const expiresAt = new Date('2026-10-08T00:00:00.000Z')

test('a trade is not voided before the grace period ends', () => {
  assert.equal(shouldVoidUnpricedTrade({ expiresAt, now: expiresAt.getTime() + 59_999, voidAfterMs: 60_000 }), false)
})

test('a trade is voided once the grace period has passed', () => {
  assert.equal(shouldVoidUnpricedTrade({ expiresAt, now: expiresAt.getTime() + 60_000, voidAfterMs: 60_000 }), true)
  assert.equal(shouldVoidUnpricedTrade({ expiresAt, now: expiresAt.getTime() + 600_000, voidAfterMs: 60_000 }), true)
})

test('a trade without an expiry is never voided', () => {
  assert.equal(shouldVoidUnpricedTrade({ expiresAt: null, now: Date.now(), voidAfterMs: 60_000 }), false)
})

test('the notification says the price was unavailable and the full stake was refunded', () => {
  const note = voidNotification({ symbol: 'BTC/USD', direction: 'UP', amount: '25.00000000', currency: 'USD' })
  assert.equal(note.type, 'SYSTEM')
  assert.match(note.title, /price unavailable/i)
  assert.match(note.body, /reliable market price/)
  assert.match(note.body, /stake of 25\.00000000 USD was refunded in full/)
})
