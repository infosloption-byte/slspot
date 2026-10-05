import assert from 'node:assert/strict'
import test from 'node:test'
import { BinanceProvider, toBinanceSymbol } from './binance.js'
import { BinanceTickStream } from './binance-stream.js'
import { CompositeProvider } from './composite.js'
import { clearLivePrices, getLivePrice, setLivePrice } from './live-prices.js'
import type { MarketDefinition } from './types.js'

const btc: MarketDefinition = { assetId: 'a1', assetType: 'CRYPTO', symbol: 'BTC/USD', provider: 'twelve-data', externalSymbol: 'BTC/USD' }

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
  assert.ok(urls[1]?.includes('symbol=BTCUSDT') && urls[1].includes('interval=5m'))
})

test('composite routes crypto to Binance and the rest to the general provider', async () => {
  const make = (name: string) => ({
    name,
    quote: async () => ({ externalSymbol: name, last: '1', bid: '1', ask: '1', changePct: '0', volume: null, timestamp: '', status: 'OPEN' as const }),
    candles: async () => [],
  })
  const composite = new CompositeProvider(make('binance'), make('twelve'))
  assert.equal((await composite.quote(btc)).externalSymbol, 'binance')
  assert.equal((await composite.quote({ ...btc, assetType: 'FOREX' })).externalSymbol, 'twelve')
  await assert.rejects(new CompositeProvider(make('binance'), null).quote({ ...btc, assetType: 'STOCK' }))
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
  setLivePrice('a1', '5', 1_000)
  assert.equal(getLivePrice('a1', 500, 1_400)?.price, '5')
  assert.equal(getLivePrice('a1', 500, 1_600), null)
})
