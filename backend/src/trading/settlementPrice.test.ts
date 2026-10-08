import assert from 'node:assert/strict'
import test, { beforeEach } from 'node:test'
import { Prisma } from '../generated/prisma/client.js'
import { clearLivePrices, setLivePrice } from '../market/live-prices.js'
import { resolveSettlementPrice, type SettlementPriceInput } from './settlementPrice.js'

const T0 = Date.parse('2026-10-08T00:00:00.000Z')

function input(overrides: Partial<SettlementPriceInput> = {}): SettlementPriceInput {
  return {
    assetId: 'a1',
    symbol: 'BTC/USD',
    expiresAt: new Date(T0 + 5_000),
    market: undefined,
    maxAgeMs: 10_000,
    now: T0 + 6_000,
    ...overrides,
  }
}

beforeEach(() => clearLivePrices())

test('settles at the tick in force at expiry, not the later current price', () => {
  setLivePrice('a1', 'binance', '100', T0 + 4_000, '1', T0 + 4_000)
  setLivePrice('a1', 'binance', '105', T0 + 5_900, '2', T0 + 5_900) // after expiry
  const result = resolveSettlementPrice(input({
    market: { lastPrice: new Prisma.Decimal('105'), lastPriceAt: new Date(T0 + 5_900), lastPriceProvider: 'binance' },
  }))
  assert.equal(result?.price.toString(), '100')
  assert.equal(result?.provider, 'binance')
  assert.equal(result?.timestamp.getTime(), T0 + 4_000)
})

test('a tick exactly at expiry counts as in force', () => {
  setLivePrice('a1', 'binance', '101', T0 + 5_000, '1', T0 + 5_000)
  assert.equal(resolveSettlementPrice(input())?.price.toString(), '101')
})

test('falls back to the current fresh price when no history covers expiry and reports lateness', () => {
  const late: unknown[] = []
  const result = resolveSettlementPrice(input({
    now: T0 + 8_000,
    market: { lastPrice: new Prisma.Decimal('110'), lastPriceAt: new Date(T0 + 7_500), lastPriceProvider: 'binance' },
    onLateFallback: (details) => late.push(details),
  }))
  assert.equal(result?.price.toString(), '110')
  assert.equal(result?.timestamp.getTime(), T0 + 7_500, 'keeps the real tick timestamp')
  assert.deepEqual(late, [{ assetId: 'a1', symbol: 'BTC/USD', lateMs: 3_000 }])
})

test('never settles on a stale or missing price', () => {
  assert.equal(resolveSettlementPrice(input()), null)
  assert.equal(resolveSettlementPrice(input({
    now: T0 + 60_000,
    market: { lastPrice: new Prisma.Decimal('110'), lastPriceAt: new Date(T0 + 1_000), lastPriceProvider: 'binance' },
  })), null)
})

test('a price is never simulated: with no reliable price the result is null', () => {
  assert.equal(resolveSettlementPrice(input()), null)
})

test('a tick older than the max age before expiry does not count', () => {
  setLivePrice('a1', 'binance', '100', T0 - 20_000, '1', T0 - 20_000)
  assert.equal(resolveSettlementPrice(input()), null)
})
