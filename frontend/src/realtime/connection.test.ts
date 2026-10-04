import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { RealtimeClient } from './connection'

type Handler = (event?: unknown) => void

class FakeWebSocket {
  static readonly OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = 0
  sent: Array<{ type: string; channel?: string }> = []
  private handlers = new Map<string, Handler[]>()

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, handler: Handler) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler])
  }

  send(payload: string) {
    this.sent.push(JSON.parse(payload))
  }

  close() {
    this.readyState = 3
  }

  emit(type: string, event?: unknown) {
    if (type === 'open') this.readyState = FakeWebSocket.OPEN
    this.handlers.get(type)?.forEach((handler) => handler(event))
  }
}

const globals = globalThis as unknown as Record<string, unknown>
const original = { WebSocket: globals.WebSocket, window: globals.window }

beforeEach(() => {
  FakeWebSocket.instances = []
  globals.WebSocket = FakeWebSocket
  globals.window = {
    setInterval: (...args: Parameters<typeof setInterval>) => setInterval(...args),
    clearInterval: (id: ReturnType<typeof setInterval>) => clearInterval(id),
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  }
})

const clients: RealtimeClient[] = []

afterEach(() => {
  clients.splice(0).forEach((client) => client.disconnect())
  globals.WebSocket = original.WebSocket
  globals.window = original.window
})

function connectedClient() {
  const client = new RealtimeClient({ url: 'ws://test', reconnect: false })
  clients.push(client)
  client.connect()
  const socket = FakeWebSocket.instances[0]!
  socket.emit('open')
  return { client, socket }
}

const subscribes = (socket: FakeWebSocket, channel: string) =>
  socket.sent.filter((message) => message.type === 'subscription.subscribe' && message.channel === channel)
const unsubscribes = (socket: FakeWebSocket, channel: string) =>
  socket.sent.filter((message) => message.type === 'subscription.unsubscribe' && message.channel === channel)

describe('realtime channel subscriptions', () => {
  it('keeps a channel alive until its last subscriber leaves', () => {
    const { client, socket } = connectedClient()
    const channel = 'user:abc' as never

    const topBar = client.subscribe(channel)
    const tradingPage = client.subscribe(channel)
    assert.equal(subscribes(socket, 'user:abc').length, 1, 'only the first subscriber hits the network')

    tradingPage() // navigating away from the trading page
    assert.equal(unsubscribes(socket, 'user:abc').length, 0, 'the top bar still needs this channel')

    topBar()
    assert.equal(unsubscribes(socket, 'user:abc').length, 1)
  })

  it('ignores a duplicate cleanup call from the same subscriber', () => {
    const { client, socket } = connectedClient()
    const channel = 'user:abc' as never

    const first = client.subscribe(channel)
    client.subscribe(channel)
    first()
    first()

    assert.equal(unsubscribes(socket, 'user:abc').length, 0)
  })

  it('subscribes once per channel after a reconnect, not once per subscriber', () => {
    const client = new RealtimeClient({ url: 'ws://test', reconnect: false })
    clients.push(client)
    const channel = 'market:btc' as never
    client.subscribe(channel)
    client.subscribe(channel)
    client.connect()
    const socket = FakeWebSocket.instances[0]!
    socket.emit('open')

    assert.equal(subscribes(socket, 'market:btc').length, 1)
  })
})
