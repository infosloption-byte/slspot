import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isRealtimeChannel, isUserChannelAuthorized } from './realtime.js'
import { parseRealtimeClientMessage } from '../realtime/events.js'

describe('realtime contracts', () => {
  it('recognizes supported channels and enforces user ownership', () => {
    assert.equal(isRealtimeChannel('market:BTCUSD'), true)
    assert.equal(isRealtimeChannel('user:user-1'), true)
    assert.equal(isRealtimeChannel('admin:all'), false)

    assert.equal(isUserChannelAuthorized('market:BTCUSD', 'user-1'), true)
    assert.equal(isUserChannelAuthorized('user:user-1', 'user-1'), true)
    assert.equal(isUserChannelAuthorized('user:user-2', 'user-1'), false)
  })

  it('parses valid subscription messages and rejects malformed messages', () => {
    const valid = parseRealtimeClientMessage(JSON.stringify({
      type: 'subscription.subscribe',
      requestId: 'req-1',
      channel: 'market:BTCUSD',
    }))

    assert.deepEqual(valid, {
      type: 'subscription.subscribe',
      requestId: 'req-1',
      channel: 'market:BTCUSD',
    })

    assert.equal(
      parseRealtimeClientMessage(JSON.stringify({
        type: 'subscription.subscribe',
        requestId: 'bad id',
        channel: 'market:BTCUSD',
      })),
      null,
    )
  })
})
