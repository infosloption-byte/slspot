import assert from 'node:assert/strict'
import test from 'node:test'
import { CandleCloseTracker } from './candle-close.js'

const MIN = 60_000

test('reports a closed bucket only when a tick lands in a later bucket', () => {
  const tracker = new CandleCloseTracker(['1min', '5min'])
  const base = 10 * 300_000
  assert.deepEqual(tracker.observe('a', base + 1_000), [], 'first tick only establishes the bucket')
  assert.deepEqual(tracker.observe('a', base + 59_000), [])
  assert.deepEqual(tracker.observe('a', base + MIN + 1), [{ interval: '1min', openTimeMs: base }])
  assert.deepEqual(tracker.observe('a', base + 300_000 + 5), [
    { interval: '1min', openTimeMs: base + MIN },
    { interval: '5min', openTimeMs: base },
  ])
})

test('late ticks never move the bucket backwards and assets are independent', () => {
  const tracker = new CandleCloseTracker(['1min'])
  const base = 100 * MIN
  tracker.observe('a', base + 5)
  tracker.observe('a', base + MIN + 5)
  assert.deepEqual(tracker.observe('a', base + 10), [])
  assert.deepEqual(tracker.observe('a', base + MIN + 20), [])
  assert.deepEqual(tracker.observe('b', base + 5), [])
  assert.deepEqual(tracker.observe('a', base + 3 * MIN), [{ interval: '1min', openTimeMs: base + MIN }])
})
