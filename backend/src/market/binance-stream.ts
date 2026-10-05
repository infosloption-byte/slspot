import { toBinanceSymbol } from './binance.js'

export type Tick = { externalSymbol: string; price: string; at: number }

type SocketLike = {
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  close(): void
}

export type BinanceTickStreamOptions = {
  url?: string
  onTick: (tick: Tick) => void
  onStatus?: (connected: boolean) => void
  createSocket?: (url: string) => SocketLike
  logger?: { info: (v: unknown, m?: string) => void; warn: (v: unknown, m?: string) => void }
  reconnectBaseMs?: number
  reconnectMaxMs?: number
}

/** Streams every trade of the given symbols (combined stream) with automatic reconnect. */
export class BinanceTickStream {
  private socket: SocketLike | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private attempts = 0
  private stopped = true
  private readonly bySymbol = new Map<string, string>()
  private readonly url: string

  constructor(private readonly options: BinanceTickStreamOptions) {
    this.url = (options.url ?? 'wss://stream.binance.com:9443').replace(/\/$/, '')
  }

  start(externalSymbols: string[]): void {
    this.bySymbol.clear()
    for (const symbol of externalSymbols) this.bySymbol.set(toBinanceSymbol(symbol), symbol)
    if (this.bySymbol.size === 0) return
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
    const streams = [...this.bySymbol.keys()].map((symbol) => symbol.toLowerCase() + '@trade').join('/')
    const url = this.url + '/stream?streams=' + streams
    let socket: SocketLike
    try {
      socket = (this.options.createSocket ?? ((target) => new WebSocket(target) as unknown as SocketLike))(url)
    } catch (error) {
      this.options.logger?.warn({ err: error }, 'Binance stream could not be opened')
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      this.attempts = 0
      this.options.onStatus?.(true)
      this.options.logger?.info({ symbols: this.bySymbol.size }, 'Binance tick stream connected')
    }
    socket.onmessage = (event) => this.handleMessage(event.data)
    socket.onerror = () => undefined
    socket.onclose = () => {
      this.socket = null
      this.options.onStatus?.(false)
      this.scheduleReconnect()
    }
  }

  private handleMessage(raw: unknown): void {
    try {
      const parsed = JSON.parse(String(raw)) as { data?: { s?: string; p?: string; T?: number } }
      const data = parsed.data
      if (!data?.s || !data.p) return
      const externalSymbol = this.bySymbol.get(data.s)
      if (!externalSymbol || !(Number(data.p) > 0)) return
      this.options.onTick({ externalSymbol, price: data.p, at: Date.now() })
    } catch {
      // ignore malformed frames
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
