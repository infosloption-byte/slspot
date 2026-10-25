import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateTradeEstimate, getStakePresets, getTradeFeedIssue, validateTradeInput } from './tradeSafety'

test('trade input validates amount, duration, balance and trading permission', () => {
  const good = { amount: 50, duration: 60, minAmount: 10, maxAmount: 100, durations: [30, 60], balance: 80, canTrade: true }
  assert.equal(validateTradeInput(good), null)
  assert.equal(validateTradeInput({ ...good, amount: NaN }), 'stake')
  assert.equal(validateTradeInput({ ...good, amount: 150 }), 'stake')
  assert.equal(validateTradeInput({ ...good, duration: 15 }), 'duration')
  assert.equal(validateTradeInput({ ...good, balance: 30 }), 'balance')
  assert.equal(validateTradeInput({ ...good, canTrade: false }), 'unavailable')
})
test('stake presets respect the asset limit and actual wallet funds', () => {
  assert.deepEqual(getStakePresets(30, 120, 80), [30, 50])
  assert.deepEqual(getStakePresets(100, 200, 50), [])
  assert.deepEqual(getStakePresets(5, 300, 300), [5, 25, 50, 100, 250])
})
test('estimated net profit includes fees', () => {
  assert.deepEqual(calculateTradeEstimate(50, .85, .02), { fee: 1, netProfit: 41.5, totalReturn: 91.5 })
})
test('stale or offline markets are not tradeable in UI', () => {
  const now = Date.parse('2026-10-25T10:00:00Z')
  assert.equal(getTradeFeedIssue('connected', new Date(now - 5_000).toISOString(), 'OPEN', now), null)
  assert.match(getTradeFeedIssue('reconnecting', new Date(now).toISOString(), 'OPEN', now)!, /connection/)
  assert.match(getTradeFeedIssue('connected', new Date(now - 60_000).toISOString(), 'OPEN', now)!, /stale/)
  assert.match(getTradeFeedIssue('connected', null, 'OPEN', now)!, /stale/)
  assert.match(getTradeFeedIssue('connected', new Date(now).toISOString(), 'HALTED', now)!, /halted/)
})
