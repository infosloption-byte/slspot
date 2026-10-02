import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { env } from '../config/env.js'
import {
  createRealtimeEvent,
  parseRealtimeEvent,
  serializeRealtimeEvent,
  type RealtimeEvent,
} from './events.js'

const WS_PATH = '/ws'
const HEARTBEAT_MS = 30_000

export class RealtimeGateway {
  private readonly sockets = new Set<WebSocket>()
  private readonly heartbeatTimers = new Map<
    WebSocket,
    ReturnType<typeof setInterval>
  >()

  register(app: FastifyInstance): void {
    app.register(websocket, {
      options: {
        maxPayload: env.websocketMaxPayloadBytes,
      },
    })

    app.get(WS_PATH, { websocket: true }, (socket) => {
      this.attach(socket)
    })
  }

  broadcastSerialized(message: string): void {
    for (const socket of this.sockets) {
      if (socket.readyState === 1) {
        socket.send(message)
      }
    }
  }

  broadcast(event: RealtimeEvent): void {
    this.broadcastSerialized(serializeRealtimeEvent(event))
  }

  closeAll(): void {
    for (const socket of this.sockets) {
      socket.close(1001, 'Server shutting down')
    }

    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer)
    }

    this.sockets.clear()
    this.heartbeatTimers.clear()
  }

  private attach(socket: WebSocket): void {
    this.sockets.add(socket)

    socket.send(
      serializeRealtimeEvent(
        createRealtimeEvent('connection.ready', {
          version: 1,
          heartbeatMs: HEARTBEAT_MS,
        }),
      ),
    )

    const timer = setInterval(() => {
      if (socket.readyState === 1) {
        socket.ping()
      }
    }, HEARTBEAT_MS)

    timer.unref()
    this.heartbeatTimers.set(socket, timer)

    socket.on('message', (raw) => {
      const message = raw.toString()

      if (message === 'ping') {
        socket.send(
          serializeRealtimeEvent(createRealtimeEvent('connection.pong', {})),
        )
        return
      }

      const event = parseRealtimeEvent(message)

      if (event?.type === 'connection.pong') {
        return
      }

      socket.send(
        serializeRealtimeEvent(
          createRealtimeEvent('connection.pong', {
            accepted: false,
          }),
        ),
      )
    })

    socket.on('close', () => this.remove(socket))
    socket.on('error', () => this.remove(socket))
  }

  private remove(socket: WebSocket): void {
    this.sockets.delete(socket)

    const timer = this.heartbeatTimers.get(socket)

    if (timer) {
      clearInterval(timer)
    }

    this.heartbeatTimers.delete(socket)
  }
}
