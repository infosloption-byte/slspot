import assert from 'node:assert/strict'
import test from 'node:test'
import { BinanceProvider, toBinanceSymbol } from './binance.js'
import { BinanceTickStream } from './binance-stream.js'
import { CompositeProvider } from './composite.js'
import { syntheticCandles } from './synthetic.js'
import { clearLivePrices, getLivePrice, setLivePrice } from './live-prices.js'
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

test('composite uses Binance first and Kraken as the next crypto fallback', async () => {
  const make = (name: string, failing = false) => ({
    name,
    assetType: 'CRYPTO' as const,
    supports: (market: MarketDefinition) => market.assetType === 'CRYPTO',
    quote: async () => {
      if (failing) throw new Error(name + ' down')
      return { provider: name, externalSymbol: name, last: '1', bid: '1', ask: '1', changePct: '0', volume: null, timestamp: new Date().toISOString(), status: 'OPEN' as const }
    },
    candles: async () => {
      if (failing) throw new Error(name + ' down')
      return []
    },
  })
  const composite = new CompositeProvider([make('binance'), make('kraken')])
  assert.equal((await composite.quote(btc)).provider, 'binance')
  assert.equal((await new CompositeProvider([make('binance', true), make('kraken')]).quote(btc)).provider, 'kraken')
  await assert.rejects(new CompositeProvider([make('binance')]).quote({ ...btc, assetType: 'STOCK' }))
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

test('composite falls back to the general provider when the crypto feed fails', async () => {
  const failing = { name: 'binance', assetType: 'CRYPTO' as const, supports: () => true, quote: async () => { throw new Error('down') }, candles: async () => { throw new Error('down') } }
  const general = {
    name: 'kraken',
    assetType: 'CRYPTO' as const,
    supports: () => true,
    quote: async () => ({ provider: 'kraken', externalSymbol: 'kraken', last: '1', bid: '1', ask: '1', changePct: '0', volume: null, timestamp: new Date().toISOString(), status: 'OPEN' as const }),
    candles: async () => [],
  }
  const composite = new CompositeProvider([failing, general])
  assert.equal((await composite.quote(btc)).provider, 'kraken')
  await assert.rejects(new CompositeProvider([failing]).candles(btc, '1min', 5))
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

test('synthetic candles end exactly at the live price with aligned buckets', () => {
  const now = Date.parse('2026-10-05T04:00:30.000Z')
  const candles = syntheticCandles('1min', 50, 68000.5, now, 'BTC/USD')
  assert.equal(candles.length, 50)
  assert.equal(candles.at(-1)?.close, '68000.50')
  assert.equal(candles.at(-1)?.openTime, '2026-10-05T04:00:00.000Z')
  for (const candle of candles) assert.ok(Number(candle.high) >= Number(candle.low))
})
