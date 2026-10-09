import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import WebSocket from 'ws'
import { buildApp } from '../app.js'
import { env } from '../config/env.js'
import { setLocalRealtimeSink } from './bus.js'
import { RealtimeGateway } from './gateway.js'
import { createRealtimeEvent, INTERNAL_SESSION_REVOCATION_CHANNEL, parseRealtimeEvent, serializeRealtimeEvent } from './events.js'
import { publishSessionsRevoked, publishUserSessionsRevoked } from './session-revocation.js'

type Message = { type: string; data?: Record<string, unknown> }
type OpenSocket = { socket: WebSocket; messages: Message[] }

function open(url: string, origin: string): Promise<OpenSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin } })
    const messages: Message[] = []
    socket.on('message', (raw) => messages.push(JSON.parse(raw.toString()) as Message))
    socket.once('open', () => resolve({ socket, messages }))
    socket.once('unexpected-response', (_request, response) => reject(new Error('HTTP ' + response.statusCode)))
    socket.once('error', reject)
  })
}

function waitForClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() }))
  })
}

describe('realtime session revocation', () => {
  const gateway = new RealtimeGateway({
    authenticate: async (request) => {
      const url = new URL(request.url, 'http://localhost')
      return {
        userId: url.searchParams.get('user') ?? 'user-default',
        sessionId: url.searchParams.get('session') ?? 'session-default',
      }
    },
    validateSession: async () => true,
  })
  const app = buildApp({ logging: false, realtimeGateway: gateway })
  const origin = env.corsOrigins[0]!
  let url = ''

  before(async () => {
    await app.listen({ host: '127.0.0.1', port: 0 })
    url = 'ws://127.0.0.1:' + (app.server.address() as AddressInfo).port + '/ws'
    setLocalRealtimeSink((message) => gateway.broadcastSerialized(message))
  })

  after(async () => {
    setLocalRealtimeSink(null)
    gateway.closeAll()
    await app.close()
  })

  it('accepts the reserved internal channel only for session revocation events', () => {
    const control = serializeRealtimeEvent(createRealtimeEvent(
      'session.revoked',
      { sessionIds: ['session-a'] },
      INTERNAL_SESSION_REVOCATION_CHANNEL,
    ))
    const publicEventOnInternalChannel = serializeRealtimeEvent(createRealtimeEvent(
      'market.price',
      { assetId: 'asset-a', last: '1' },
      INTERNAL_SESSION_REVOCATION_CHANNEL,
    ))

    assert.equal(parseRealtimeEvent(control)?.type, 'session.revoked')
    assert.equal(parseRealtimeEvent(publicEventOnInternalChannel), null)
  })

  it('closes only sockets for explicitly revoked session IDs and never forwards the control event', async () => {
    const target = await open(url + '?user=user-a&session=session-a', origin)
    const sameUserOtherSession = await open(url + '?user=user-a&session=session-b', origin)
    const otherUser = await open(url + '?user=user-b&session=session-c', origin)
    const closed = waitForClose(target.socket)

    await publishSessionsRevoked(['session-a'])
    const closeResult = await closed

    assert.equal(closeResult.code, 1008)
    assert.equal(closeResult.reason, 'Session revoked')
    assert.equal(sameUserOtherSession.socket.readyState, WebSocket.OPEN)
    assert.equal(otherUser.socket.readyState, WebSocket.OPEN)
    assert.equal(
      [...target.messages, ...sameUserOtherSession.messages, ...otherUser.messages].some((message) => message.type === 'session.revoked'),
      false,
      'internal revocation commands must never be sent to browser clients',
    )

    sameUserOtherSession.socket.close()
    otherUser.socket.close()
  })

  it('revokes all sockets for a user but preserves the explicitly retained session', async () => {
    const retained = await open(url + '?user=user-a&session=session-current', origin)
    const revoked = await open(url + '?user=user-a&session=session-old', origin)
    const otherUser = await open(url + '?user=user-b&session=session-other', origin)
    const closed = waitForClose(revoked.socket)

    await publishUserSessionsRevoked('user-a', 'session-current')
    const closeResult = await closed

    assert.equal(closeResult.code, 1008)
    assert.equal(closeResult.reason, 'Session revoked')
    assert.equal(retained.socket.readyState, WebSocket.OPEN)
    assert.equal(otherUser.socket.readyState, WebSocket.OPEN)
    assert.equal(
      [...retained.messages, ...revoked.messages, ...otherUser.messages].some((message) => message.type === 'session.revoked'),
      false,
      'internal revocation commands must never be sent to browser clients',
    )

    retained.socket.close()
    otherUser.socket.close()
  })
})
