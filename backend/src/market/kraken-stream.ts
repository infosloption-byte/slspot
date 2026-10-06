import type { SocketLike } from './binance-stream.js'

export type KrakenTick = { provider: 'kraken'; externalSymbol: string; price: string; at: number; sequence: string }

export type KrakenTickStreamOptions = {
  url?: string
  onTick: (tick: KrakenTick) => void
  onStatus?: (connected: boolean) => void
  createSocket?: (url: string) => SocketLike
  logger?: { info: (v: unknown, m?: string) => void; warn: (v: unknown, m?: string) => void }
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

export class KrakenTickStream {
  private socket: SocketLike | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  private stopped = true
  private readonly url: string

  constructor(private readonly options: KrakenTickStreamOptions) {
    this.url = (options.url ?? 'wss://ws.kraken.com/v2').replace(/\/$/, '')
  }

  start(externalSymbols: string[]): void {
    if (externalSymbols.length === 0) return
    this.stopped = false
    this.connect(externalSymbols)
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

  private connect(externalSymbols: string[]): void {
    let socket: SocketLike
    try {
      socket = (this.options.createSocket ?? ((target) => new WebSocket(target) as unknown as SocketLike))(this.url)
    } catch (error) {
      this.options.logger?.warn({ err: error }, 'Kraken tick stream could not be opened')
      this.scheduleReconnect(externalSymbols)
      return
    }

    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      this.options.onStatus?.(true)
      socket.send?.(JSON.stringify({
        method: 'subscribe',
        params: { channel: 'trade', symbol: externalSymbols, snapshot: false },
      }))
    }
    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as { channel?: string; type?: string; data?: Array<{ symbol?: string; price?: number | string; timestamp?: string; trade_id?: number }> }
        if (parsed.channel !== 'trade' || !Array.isArray(parsed.data)) return
        for (const trade of parsed.data) {
          if (typeof trade.symbol !== 'string' || trade.price == null || typeof trade.timestamp !== 'string' || trade.trade_id == null) continue
          const at = Date.parse(trade.timestamp)
          const price = String(trade.price)
          if (!Number.isFinite(at) || !(Number(price) > 0)) continue
          this.options.onTick({ provider: 'kraken', externalSymbol: trade.symbol, price, at, sequence: String(trade.trade_id) })
        }
      } catch {
        // Ignore malformed market frames.
      }
    }
    socket.onerror = (event) => this.options.logger?.warn({ event }, 'Kraken tick stream error')
    socket.onclose = () => {
      this.socket = null
      this.options.onStatus?.(false)
      this.scheduleReconnect(externalSymbols)
    }
  }

  private scheduleReconnect(externalSymbols: string[]): void {
    if (this.stopped || this.timer) return
    const base = this.options.reconnectBaseMs ?? 1_000
    const max = this.options.reconnectMaxMs ?? 30_000
    const delay = Math.min(max, base * 2 ** Math.min(this.attempts, 6))
    this.attempts += 1
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.stopped) this.connect(externalSymbols)
    }, delay)
    this.timer.unref?.()
  }
}
