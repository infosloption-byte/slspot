import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TwelveDataProvider } from './twelve-data.js'

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type':'application/json' } })
}

const market = {
  assetId:'asset-1',
  assetType:'CRYPTO' as const,
  symbol:'BTC/USD',
  provider:'twelve-data',
  externalSymbol:'BTC/USD',
}

describe('twelve data market provider', () => {
  it('normalizes quote payloads', async () => {
    const provider = new TwelveDataProvider({
      apiKey:'test-key',
      fetcher:async () => response({close:'113842.12',percent_change:'1.82',volume:'2100000000',timestamp:1770000000,is_market_open:true,status:'ok'}),
    })
    const quote = await provider.quote(market)
    assert.equal(quote.last,'113842.12')
    assert.equal(quote.changePct,'1.82')
    assert.equal(quote.volume,'2100000000')
    assert.equal(quote.status,'OPEN')
  })

  it('normalizes candle values', async () => {
    const provider = new TwelveDataProvider({
      apiKey:'test-key',
      fetcher:async () => response({status:'ok',values:[{datetime:'2026-10-02 10:00:00',open:'100',high:'102',low:'99',close:'101',volume:'200'}]}),
    })
    const candles = await provider.candles(market,'1min',10)
    assert.equal(candles.length,1)
    assert.equal(candles[0]?.open,'100')
    assert.equal(candles[0]?.high,'102')
    assert.equal(candles[0]?.close,'101')
    assert.equal(candles[0]?.volume,'200')
    assert.equal(new Date(candles[0]!.closeTime).getTime() - new Date(candles[0]!.openTime).getTime(),60_000)
  })

  it('rejects provider errors', async () => {
    const provider = new TwelveDataProvider({
      apiKey:'test-key',
      fetcher:async () => response({status:'error',message:'rate limited',code:429}),
    })
    await assert.rejects(() => provider.quote(market),/rate limited/)
  })
})
