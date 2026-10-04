import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import type { AddressInfo } from 'node:net'
import WebSocket from 'ws'
import { buildApp } from '../app.js'
import { env } from '../config/env.js'
import { RealtimeGateway } from './gateway.js'
import { createRealtimeEvent, serializeRealtimeEvent } from './events.js'
import { publishRealtime, setLocalRealtimeSink } from './bus.js'

type Message = { type: string; data?: Record<string, unknown> }

function open(url: string, origin: string): Promise<{ socket: WebSocket; messages: Message[] }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: origin } })
    const messages: Message[] = []
    socket.on('message', (raw) => messages.push(JSON.parse(raw.toString()) as Message))
    socket.once('open', () => resolve({ socket, messages }))
    socket.once('unexpected-response', (_request, response) => reject(new Error('HTTP ' + response.statusCode)))
    socket.once('error', reject)
  })
}

async function waitFor(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const started = Date.now()
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('realtime gateway', () => {
  const gateway = new RealtimeGateway()
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

  it('completes the WebSocket handshake (regression: route was registered as plain HTTP and returned 500)', async () => {
    const { socket, messages } = await open(url, origin)
    await waitFor(() => messages.length > 0)
    assert.equal(messages[0]?.type, 'connection.ready')
    socket.close()
  })

  it('rejects an untrusted origin', async () => {
    await assert.rejects(open(url, 'http://evil.example'), /HTTP 403/)
  })

  it('delivers published events to subscribed clients without Redis', async () => {
    const { socket, messages } = await open(url, origin)
    socket.send(JSON.stringify({ type: 'subscription.subscribe', requestId: 'r1', channel: 'market:asset-1' }))
    await waitFor(() => messages.some((message) => message.type === 'subscription.updated'))

    await publishRealtime(serializeRealtimeEvent(createRealtimeEvent('market.price', { assetId: 'asset-1', last: '101.5' }, 'market:asset-1')))
    await publishRealtime(serializeRealtimeEvent(createRealtimeEvent('market.price', { assetId: 'asset-2', last: '9' }, 'market:asset-2')))

    await waitFor(() => messages.some((message) => message.type === 'market.price'))
    const prices = messages.filter((message) => message.type === 'market.price')
    assert.equal(prices.length, 1, 'only the subscribed channel is delivered')
    assert.equal(prices[0]?.data?.last, '101.5')
    socket.close()
  })
})
