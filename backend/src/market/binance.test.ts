import assert from 'node:assert/strict'
import test from 'node:test'
import { BinanceProvider, toBinanceSymbol } from './binance.js'
import { BinanceTickStream } from './binance-stream.js'
import { clearLivePrices, getLivePrice, getLivePriceAt, setLivePrice } from './live-prices.js'
import type { MarketDefinition } from './types.js'

const btc: MarketDefinition = { assetId: 'a1', assetType: 'CRYPTO', symbol: 'BTC/USD', provider: 'binance', externalSymbol: 'BTC/USD' }

test('maps USD pairs to Binance USDT symbols', () => {
  assert.equal(toBinanceSymbol('BTC/USD'), 'BTCUSDT')
  assert.equal(toBinanceSymbol('eth/usd'), 'ETHUSDT')
})

test('quote and candles are parsed from Binance responses', async () => {
  const urls: string[] = []
  const fetcher = (async (input: URL | string) => {
    const url = new URL(String(input))
    urls.push(url.pathname + url.search)
    const body = url.pathname.endsWith('klines')
      ? [[1_700_000_000_000, '100', '110', '95', '105', '12.5', 0]]
      : { lastPrice: '105.5', bidPrice: '105.4', askPrice: '105.6', priceChangePercent: '1.2', volume: '99', closeTime: 1_700_000_000_000 }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
  const provider = new BinanceProvider({ fetcher })

  const quote = await provider.quote(btc)
  assert.equal(quote.last, '105.5')
  assert.equal(quote.changePct, '1.2')

  const candles = await provider.candles(btc, '5min', 2)
  assert.equal(candles[0]?.close, '105')
  assert.equal(candles[0]?.closeTime, new Date(1_700_000_300_000).toISOString())
  const klines = urls.find((url) => url.includes('klines'))
  assert.ok(klines?.includes('symbol=BTCUSDT') && klines.includes('interval=5m'))
})

test('tick stream emits ticks, ignores junk and reconnects after a close', async () => {
  const sockets: Array<{ onopen: any; onmessage: any; onclose: any; onerror: any; close: () => void; url: string }> = []
  const ticks: string[] = []
  const stream = new BinanceTickStream({
    reconnectBaseMs: 5,
    onTick: (tick) => ticks.push(tick.externalSymbol + '=' + tick.price),
    createSocket: (url) => {
      const socket = { onopen: null, onmessage: null, onclose: null, onerror: null, close() {}, url }
      sockets.push(socket)
      return socket
    },
  })
  stream.start(['BTC/USD', 'ETH/USD'])
  assert.ok(sockets[0]?.url.includes('streams=btcusdt@trade/ethusdt@trade'))
  sockets[0]!.onmessage({ data: JSON.stringify({ stream: 'btcusdt@trade', data: { s: 'BTCUSDT', p: '68000.10' } }) })
  sockets[0]!.onmessage({ data: 'not json' })
  sockets[0]!.onmessage({ data: JSON.stringify({ data: { s: 'DOGEUSDT', p: '1' } }) })
  assert.deepEqual(ticks, ['BTC/USD=68000.10'])

  sockets[0]!.onclose({})
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.equal(sockets.length, 2)
  stream.stop()
})

test('live price cache honours freshness', () => {
  clearLivePrices()
  setLivePrice('a1', 'binance', '5', 1_000, '1', 1_000)
  assert.equal(getLivePrice('a1', 500, 1_400, 'binance')?.price, '5')
  assert.equal(getLivePrice('a1', 500, 1_600, 'binance'), null)
})

test('binance provider answers from a fallback host when the primary is unreachable', async () => {
  const hosts: string[] = []
  const fetcher = (async (input: URL | string) => {
    const url = new URL(String(input))
    hosts.push(url.host)
    if (url.host === 'api.binance.com') throw new DOMException('aborted', 'AbortError')
    return new Response(JSON.stringify({ lastPrice: '7', closeTime: 1 }), { status: 200 })
  }) as typeof fetch
  const quote = await new BinanceProvider({ fetcher }).quote(btc)
  assert.equal(quote.last, '7')
  assert.ok(hosts.includes('api.binance.com') && hosts.includes('data-api.binance.vision'))
})

test('tick stream rotates to the next host when one never opens', async () => {
  const urls: string[] = []
  const sockets: Array<{ onclose: any }> = []
  const stream = new BinanceTickStream({
    url: 'wss://a.example',
    fallbackUrls: ['wss://b.example'],
    reconnectBaseMs: 1,
    onTick: () => undefined,
    createSocket: (url) => {
      urls.push(url)
      const socket = { onopen: null, onmessage: null, onclose: null as any, onerror: null, close() {} }
      sockets.push(socket)
      return socket
    },
  })
  stream.start(['BTC/USD'])
  sockets[0]!.onclose({})
  await new Promise((resolve) => setTimeout(resolve, 30))
  stream.stop()
  assert.ok(urls[0]?.startsWith('wss://a.example') && urls[1]?.startsWith('wss://b.example'))
})

test('getLivePriceAt returns the tick in force at the requested instant', () => {
  clearLivePrices()
  const base = Date.now() - 5_000
  setLivePrice('a1', 'binance', '100', base, '1', base)
  setLivePrice('a1', 'binance', '101', base + 1_000, '2', base + 1_000)
  setLivePrice('a1', 'binance', '103', base + 3_000, '3', base + 3_000)
  assert.equal(getLivePriceAt('a1', base + 500, 10_000)?.price, '100')
  assert.equal(getLivePriceAt('a1', base + 2_999, 10_000)?.price, '101')
  assert.equal(getLivePriceAt('a1', base + 3_000, 10_000)?.price, '103')
  assert.equal(getLivePriceAt('a1', base - 1, 10_000), null)
  assert.equal(getLivePriceAt('a1', base + 20_000, 5_000), null)
  clearLivePrices()
})
