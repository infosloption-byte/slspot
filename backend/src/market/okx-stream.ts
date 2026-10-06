import type { SocketLike } from './binance-stream.js'
import { toOkxInstrument } from './okx.js'

export type OkxTick = { provider: 'okx'; externalSymbol: string; price: string; at: number; sequence: string }

export type OkxTickStreamOptions = {
  url?: string
  onTick: (tick: OkxTick) => void
  onStatus?: (connected: boolean) => void
  createSocket?: (url: string) => SocketLike
  logger?: { info: (v: unknown, m?: string) => void; warn: (v: unknown, m?: string) => void }
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

export class OkxTickStream {
  private socket: SocketLike | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  private stopped = true
  private readonly url: string
  private readonly byInstrument = new Map<string, string>()

  constructor(private readonly options: OkxTickStreamOptions) {
    this.url = (options.url ?? 'wss://ws.okx.com/ws/v5/public').replace(/\/$/, '')
  }

  start(externalSymbols: string[]): void {
    this.byInstrument.clear()
    for (const externalSymbol of externalSymbols) this.byInstrument.set(toOkxInstrument(externalSymbol), externalSymbol)
    if (this.byInstrument.size === 0) return
    this.stopped = false
    this.connect()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const socket = this.socket
    this.socket = null
    if (socket) {
      socket.onclose = null
      socket.close()
    }
  }

  private connect(): void {
    let socket: SocketLike
    try {
      socket = (this.options.createSocket ?? ((target) => new WebSocket(target) as unknown as SocketLike))(this.url)
    } catch (error) {
      this.options.logger?.warn({ err: error }, 'OKX tick stream could not be opened')
      this.scheduleReconnect()
      return
    }

    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      this.options.onStatus?.(true)
      socket.send?.(JSON.stringify({
        op: 'subscribe',
        args: [...this.byInstrument.keys()].map((instId) => ({ channel: 'trades', instId })),
      }))
    }
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as { arg?: { channel?: string; instId?: string }; data?: Array<{ instId?: string; px?: string; ts?: string; tradeId?: string }> }
        if (parsed.arg?.channel !== 'trades' || !Array.isArray(parsed.data)) return
        for (const trade of parsed.data) {
          const instId = trade.instId ?? parsed.arg.instId
          const externalSymbol = instId ? this.byInstrument.get(instId) : undefined
          if (!externalSymbol || !trade.px || !trade.ts || !trade.tradeId) continue
          const at = Number(trade.ts)
          if (!Number.isFinite(at) || !(Number(trade.px) > 0)) continue
          this.options.onTick({ provider: 'okx', externalSymbol, price: trade.px, at, sequence: trade.tradeId })
        }
      } catch {
        // Ignore malformed market frames.
      }
    }
    socket.onerror = (event) => this.options.logger?.warn({ event }, 'OKX tick stream error')
    socket.onclose = () => {
      this.socket = null
      this.options.onStatus?.(false)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return
    const base = this.options.reconnectBaseMs ?? 1_000
    const max = this.options.reconnectMaxMs ?? 30_000
    const delay = Math.min(max, base * 2 ** Math.min(this.attempts, 6))
    this.attempts += 1
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.stopped) this.connect()
    }, delay)
    this.timer.unref?.()
  }
}
