import websocket from '@fastify/websocket'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { env } from '../config/env.js'
import { isUserChannelAuthorized, type RealtimeChannel } from '../contracts/realtime.js'
import {
  createRealtimeEvent,
  parseRealtimeClientMessage,
  parseRealtimeEvent,
  serializeRealtimeEvent,
  type RealtimeEvent,
} from './events.js'

const WS_PATH = '/ws'
const HEARTBEAT_MS = 30_000

type AuthenticatedSocket = { userId: string }

export type RealtimeGatewayOptions = {
  authenticate?: (request: FastifyRequest) => Promise<AuthenticatedSocket | null>
}

export class RealtimeGateway {
  private readonly sockets = new Map<WebSocket, AuthenticatedSocket>()
  private readonly heartbeatTimers = new Map<WebSocket, ReturnType<typeof setInterval>>()
  private readonly subscriptions = new Map<WebSocket, Set<RealtimeChannel>>()

  constructor(private readonly options: RealtimeGatewayOptions = {}) {}

  register(app: FastifyInstance): void {
    app.register(websocket, {
      options: { maxPayload: env.websocketMaxPayloadBytes },
    })

    app.get(WS_PATH, { websocket: true }, async (socket, request) => {
      if (this.options.authenticate) {
        const principal = await this.options.authenticate(request)
        if (!principal) {
          socket.close(1008, 'Authentication required')
          return
        }
        this.attach(socket, principal)
        return
      }

      this.attach(socket, { userId: 'anonymous' })
    })
  }

  broadcastSerialized(message: string): void {
    const event = parseRealtimeEvent(message)

    for (const socket of this.sockets.keys()) {
      if (socket.readyState !== 1) continue

      if (!event?.channel) {
        socket.send(message)
        continue
      }

      if (this.subscriptions.get(socket)?.has(event.channel)) {
        socket.send(message)
      }
    }
  }

  broadcast(event: RealtimeEvent): void {
    this.broadcastSerialized(serializeRealtimeEvent(event))
  }

  closeAll(): void {
    for (const socket of this.sockets.keys()) socket.close(1001, 'Server shutting down')
    for (const timer of this.heartbeatTimers.values()) clearInterval(timer)
    this.sockets.clear()
    this.heartbeatTimers.clear()
    this.subscriptions.clear()
  }

  private attach(socket: WebSocket, principal: AuthenticatedSocket): void {
    this.sockets.set(socket, principal)
    this.subscriptions.set(socket, new Set())

    socket.send(
      serializeRealtimeEvent(
        createRealtimeEvent('connection.ready', {
          version: 1,
          heartbeatMs: HEARTBEAT_MS,
          authenticated: true,
        }),
      ),
    )

    const timer = setInterval(() => {
      if (socket.readyState === 1) socket.ping()
    }, HEARTBEAT_MS)

    timer.unref()
    this.heartbeatTimers.set(socket, timer)

    socket.on('message', (raw) => {
      const message = raw.toString()

      if (message === 'ping') {
        socket.send(serializeRealtimeEvent(createRealtimeEvent('connection.pong', { accepted: true })))
        return
      }

      const clientMessage = parseRealtimeClientMessage(message)

      if (!clientMessage) {
        socket.send(
          serializeRealtimeEvent(
            createRealtimeEvent('subscription.rejected', {
              reason: 'INVALID_MESSAGE',
            }),
          ),
        )
        return
      }

      if (clientMessage.type === 'connection.ping') {
        socket.send(
          serializeRealtimeEvent(
            createRealtimeEvent('connection.pong', {
              accepted: true,
              ...(clientMessage.requestId ? { requestId: clientMessage.requestId } : {}),
            }),
          ),
        )
        return
      }

      const authorized = isUserChannelAuthorized(clientMessage.channel, principal.userId)

      if (!authorized) {
        socket.send(
          serializeRealtimeEvent(
            createRealtimeEvent('subscription.rejected', {
              requestId: clientMessage.requestId,
              channel: clientMessage.channel,
              reason: 'FORBIDDEN',
            }),
          ),
        )
        return
      }

      const subscriptions = this.subscriptions.get(socket)
      if (!subscriptions) return

      if (clientMessage.type === 'subscription.subscribe') {
        subscriptions.add(clientMessage.channel)
        socket.send(
          serializeRealtimeEvent(
            createRealtimeEvent('subscription.updated', {
              requestId: clientMessage.requestId,
              channel: clientMessage.channel,
              subscribed: true,
            }),
          ),
        )
        return
      }

      subscriptions.delete(clientMessage.channel)
      socket.send(
        serializeRealtimeEvent(
          createRealtimeEvent('subscription.updated', {
            requestId: clientMessage.requestId,
            channel: clientMessage.channel,
            subscribed: false,
          }),
        ),
      )
    })

    socket.on('close', () => this.remove(socket))
    socket.on('error', () => this.remove(socket))
  }

  private remove(socket: WebSocket): void {
    this.sockets.delete(socket)
    this.subscriptions.delete(socket)
    const timer = this.heartbeatTimers.get(socket)
    if (timer) clearInterval(timer)
    this.heartbeatTimers.delete(socket)
  }
}
