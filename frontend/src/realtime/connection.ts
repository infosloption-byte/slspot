import { parseRealtimeMessage } from './events'
import type { RealtimeChannel, RealtimeClientMessage, RealtimeEvent } from './contracts'
import { getReconnectDelay } from './reconnect'

export type RealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'closed'

type Listener = (event: RealtimeEvent) => void
type StateListener = (state: RealtimeConnectionState) => void

export type RealtimeClientOptions = {
  url?: string
  reconnect?: boolean
  minimumReconnectMs?: number
  maximumReconnectMs?: number
}

export class RealtimeClient {
  private readonly url: string
  private readonly shouldReconnect: boolean
  private readonly minimumReconnectMs: number
  private readonly maximumReconnectMs: number
  private socket: WebSocket | null = null
  private stateValue: RealtimeConnectionState = 'idle'
  private reconnectAttempt = 0
  private reconnectTimer: number | null = null
  private heartbeatTimer: number | null = null
  private intentionalClose = false
  /**
   * Channel -> number of active subscribers. The top bar, the trading page and the
   * account pages can all listen to the same channel; one of them unmounting must
   * not unsubscribe the others.
   */
  private readonly channels = new Map<RealtimeChannel, number>()
  private readonly listeners = new Set<Listener>()
  private readonly stateListeners = new Set<StateListener>()

  constructor(options: RealtimeClientOptions = {}) {
    this.url = options.url ?? defaultRealtimeUrl()
    this.shouldReconnect = options.reconnect ?? true
    this.minimumReconnectMs = options.minimumReconnectMs ?? 500
    this.maximumReconnectMs = options.maximumReconnectMs ?? 15_000
  }

  get state(): RealtimeConnectionState {
    return this.stateValue
  }

  connect(): void {
    if (this.socket || this.stateValue === 'connecting') return

    this.intentionalClose = false
    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
    this.socket = new WebSocket(this.url)

    this.socket.addEventListener('open', this.handleOpen)
    this.socket.addEventListener('message', this.handleMessage)
    this.socket.addEventListener('close', this.handleClose)
    this.socket.addEventListener('error', this.handleError)
  }

  disconnect(): void {
    this.intentionalClose = true
    this.clearReconnectTimer()
    this.stopHeartbeat()
    const socket = this.socket
    this.socket = null
    if (socket) socket.close(1000, 'Client closed connection')
    this.setState('closed')
  }

  subscribe(channel: RealtimeChannel): () => void {
    const count = this.channels.get(channel) ?? 0
    this.channels.set(channel, count + 1)
    // Only the first subscriber triggers a network subscribe.
    if (count === 0 && this.stateValue === 'connected') this.sendSubscription('subscription.subscribe', channel)

    let released = false
    return () => {
      // Calling the cleanup twice (StrictMode, double unmount) must not steal another subscriber's count.
      if (released) return
      released = true

      const remaining = (this.channels.get(channel) ?? 1) - 1
      if (remaining > 0) {
        this.channels.set(channel, remaining)
        return
      }

      this.channels.delete(channel)
      if (this.stateValue === 'connected') this.sendSubscription('subscription.unsubscribe', channel)
    }
  }

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    listener(this.stateValue)
    return () => this.stateListeners.delete(listener)
  }

  private readonly handleOpen = () => {
    this.reconnectAttempt = 0
    this.setState('connected')
    this.startHeartbeat()
    this.resubscribeAll()
  }

  private readonly handleMessage = (event: MessageEvent<string>) => {
    const parsed = parseRealtimeMessage(event.data)
    if (!parsed) return
    this.listeners.forEach((listener) => listener(parsed))
  }

  private readonly handleClose = () => {
    this.stopHeartbeat()
    this.socket = null

    if (this.intentionalClose || !this.shouldReconnect) {
      this.setState('closed')
      return
    }

    this.reconnectAttempt += 1
    this.setState('reconnecting')
    this.scheduleReconnect()
  }

  private readonly handleError = () => {
    // The close event controls reconnecting. Errors are intentionally not surfaced as separate state transitions.
  }

  private send(message: RealtimeClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify(message))
  }

  private sendSubscription(type: 'subscription.subscribe' | 'subscription.unsubscribe', channel: RealtimeChannel): void {
    this.send({ type, requestId: crypto.randomUUID(), channel })
  }

  private resubscribeAll(): void {
    this.channels.forEach((_count, channel) => this.sendSubscription('subscription.subscribe', channel))
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      this.send({ type: 'connection.ping', requestId: crypto.randomUUID() })
    }, 25_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    const delay = getReconnectDelay(this.reconnectAttempt, this.minimumReconnectMs, this.maximumReconnectMs)
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private setState(state: RealtimeConnectionState): void {
    this.stateValue = state
    this.stateListeners.forEach((listener) => listener(state))
  }
}

function defaultRealtimeUrl(): string {
  if (typeof window === 'undefined') return 'ws://localhost:8080/ws'

  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  if (import.meta.env.VITE_WS_BASE_URL) return import.meta.env.VITE_WS_BASE_URL

  if (import.meta.env.DEV) return 'ws://localhost:8080/ws'

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return protocol + '//' + window.location.host + '/ws'
}
