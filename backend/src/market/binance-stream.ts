import { toBinanceSymbol } from './binance.js'

export type Tick = { provider: 'binance'; externalSymbol: string; price: string; at: number; sequence: string }

export type SocketLike = {
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null
  close(): void
}

export type BinanceTickStreamOptions = {
  url?: string
  fallbackUrls?: string[]
  onTick: (tick: Tick) => void
  onStatus?: (connected: boolean) => void
  createSocket?: (url: string) => SocketLike
  logger?: { info: (v: unknown, m?: string) => void; warn: (v: unknown, m?: string) => void }
  connectTimeoutMs?: number
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
  private readonly urls: string[]
  private urlIndex = 0
  private opened = false

  constructor(private readonly options: BinanceTickStreamOptions) {
    this.urls = [...new Set([
      options.url ?? 'wss://stream.binance.com:9443',
      ...(options.fallbackUrls ?? ['wss://stream.binance.com:443', 'wss://data-stream.binance.vision']),
    ].map((url) => url.replace(/\/$/, '')))]
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
    this.opened = false
    const url = this.urls[this.urlIndex % this.urls.length] + '/stream?streams=' + streams
    let socket: SocketLike
    try {
      socket = (this.options.createSocket ?? ((target) => new WebSocket(target) as unknown as SocketLike))(url)
    } catch (error) {
      this.options.logger?.warn({ err: error }, 'Binance stream could not be opened')
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    // A blocked network can leave the handshake hanging; give up on this host and rotate.
    const connectTimer = setTimeout(() => { if (!this.opened) socket.close() }, this.options.connectTimeoutMs ?? 8_000)
    connectTimer.unref?.()
    socket.onopen = () => {
      this.attempts = 0
      this.opened = true
      this.options.onStatus?.(true)
      this.options.logger?.info({ symbols: this.bySymbol.size }, 'Binance tick stream connected')
    }
    socket.onmessage = (event) => this.handleMessage(event.data)
    socket.onerror = () => undefined
    socket.onclose = () => {
      clearTimeout(connectTimer)
      this.socket = null
      // An endpoint that never opened is probably blocked here: try the next host.
      if (!this.opened) this.urlIndex += 1
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
      this.options.onTick({ provider: 'binance', externalSymbol, price: data.p, at: Number.isFinite(data.T) ? data.T : Date.now(), sequence: String(data.a ?? data.T ?? Date.now()) })
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
