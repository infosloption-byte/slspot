import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyLivePrice, reconcileLiveBar } from './liveCandle'

const bar = { time: 1_000, open: 10, high: 12, low: 9, close: 11, volume: 5 }

describe('applyLivePrice', () => {
  it('extends the current candle and becomes the close', () => {
    assert.deepEqual(applyLivePrice(bar, 13, 300, 1_100), { time: 1_000, open: 10, high: 13, low: 9, close: 13, volume: 5 })
    assert.deepEqual(applyLivePrice(bar, 8, 300, 1_100), { time: 1_000, open: 10, high: 12, low: 8, close: 8, volume: 5 })
  })

  it('accumulates high and low across successive ticks', () => {
    const afterSpike = applyLivePrice(bar, 14, 300, 1_050)
    const afterDrop = applyLivePrice(afterSpike, 11.2, 300, 1_060)
    assert.equal(afterDrop.high, 14, 'the earlier spike must not be forgotten')
    assert.equal(afterDrop.close, 11.2)
  })

  it('starts a new candle on the same grid once the period has elapsed', () => {
    const next = applyLivePrice(bar, 12.5, 300, 1_300)
    assert.deepEqual(next, { time: 1_300, open: 11, high: 12.5, low: 11, close: 12.5, volume: 0 })
  })

  it('skips ahead when several periods passed without a candle', () => {
    assert.equal(applyLivePrice(bar, 11, 300, 1_000 + 3 * 300 + 40).time, 1_900)
  })

  it('treats a clock slightly behind the candle as the same candle', () => {
    assert.equal(applyLivePrice(bar, 11, 300, 990).time, 1_000)
  })
})

describe('reconcileLiveBar', () => {
  const server = { time: 1_000, open: 10, high: 12, low: 9, close: 11, volume: 5 }

  it('uses the server bar when there is no local bar', () => {
    assert.equal(reconcileLiveBar(null, server), server)
  })

  it('keeps a locally started newer candle when a late event for the old period arrives', () => {
    const rolled = applyLivePrice(server, 13, 300, 1_310)
    const afterSpike = applyLivePrice(rolled, 15, 300, 1_320)
    assert.equal(reconcileLiveBar(afterSpike, server), afterSpike)
    assert.equal(reconcileLiveBar(afterSpike, server)?.high, 15, 'accumulated high is preserved')
  })

  it('lets the server bar win once it covers the same or a newer period', () => {
    const rolled = applyLivePrice(server, 13, 300, 1_310)
    const serverNext = { ...rolled, open: 11.1, close: 12.9 }
    assert.equal(reconcileLiveBar(rolled, serverNext), serverNext)
  })

  it('returns null when the dataset has no candles', () => {
    assert.equal(reconcileLiveBar(server, null), null)
  })
})
