import websocket from '@fastify/websocket'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { WebSocket } from 'ws'
import { env } from '../config/env.js'
import { assertTrustedWebSocketOrigin } from '../security/origin.js'
import { enforceRateLimit } from '../security/rate-limit.js'
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
type RealtimeRequest = FastifyRequest & { realtimePrincipal?: AuthenticatedSocket }

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

    // The route lives in its own plugin so it is only defined after @fastify/websocket
    // has finished loading. Declaring `app.get(..., { websocket: true })` right next to the
    // un-awaited `app.register(websocket)` can run before the plugin's onRoute hook exists;
    // the route is then treated as a plain HTTP route, and every handshake fails with a 500
    // ("socket.terminate is not a function") which the browser reports as
    // "WebSocket connection to 'ws://.../ws' failed".
    app.register(async (instance) => {
      instance.get(
        WS_PATH,
        {
          websocket: true,
          preValidation: async (request, reply) => {
            try {
              assertTrustedWebSocketOrigin(request)
              await enforceRateLimit({
                key: 'ws:' + request.ip,
                limit: env.security.rateLimit.generalLimit,
                windowSeconds: env.security.rateLimit.generalWindowSeconds,
              })

              if (this.options.authenticate) {
                const principal = await this.options.authenticate(request)
                if (!principal) {
                  return reply.code(401).send({
                    success: false,
                    error: {
                      code: 'UNAUTHENTICATED',
                      message: 'Authentication is required',
                    },
                  })
                }
                ;(request as RealtimeRequest).realtimePrincipal = principal
              } else {
                ;(request as RealtimeRequest).realtimePrincipal = { userId: 'anonymous' }
              }
            } catch (error) {
              const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
                ? Number((error as { statusCode?: unknown }).statusCode)
                : 403
              const code = typeof error === 'object' && error !== null && 'code' in error
                ? String((error as { code?: unknown }).code)
                : 'WS_SECURITY_REJECTED'
              const message = error instanceof Error ? error.message : 'WebSocket connection is not allowed'

              request.log.warn({ securityCode: code }, 'WebSocket security check rejected connection')
              return reply.code(statusCode >= 400 && statusCode < 500 ? statusCode : 403).send({
                success: false,
                error: { code, message },
              })
            }

            return undefined
          },
        },
        (socket, request) => {
          const principal = (request as RealtimeRequest).realtimePrincipal
          if (!principal) {
            socket.terminate()
            return
          }

          this.attach(socket, principal)
        },
      )
    })
  }

  broadcastSerialized(message: string): void {
    const event = parseRealtimeEvent(message)
    if (!event) return

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
