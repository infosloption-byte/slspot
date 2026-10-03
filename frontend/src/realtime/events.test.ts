import assert from 'node:assert/strict'
import test from 'node:test'
import { parseRealtimeEvent } from './events'

test('accepts a valid market candle realtime event', () => {
  const event = parseRealtimeEvent(JSON.stringify({
    version: 1,
    id: 'event-1',
    type: 'market.candle',
    timestamp: '2026-10-03T17:00:00.000Z',
    channel: 'market:asset-1',
    data: {
      assetId: 'asset-1',
      symbol: 'BTC/USD',
      interval: '5min',
      openTime: '2026-10-03T16:55:00.000Z',
      closeTime: '2026-10-03T17:00:00.000Z',
      open: '100',
      high: '105',
      low: '99',
      close: '104',
      volume: '42',
    },
  }))

  assert.equal(event?.type, 'market.candle')
  assert.equal(event?.channel, 'market:asset-1')
})

test('rejects malformed realtime events', () => {
  const event = parseRealtimeEvent('{"version":1,"id":"x","timestamp":"now"}')
  assert.equal(event, null)
})
