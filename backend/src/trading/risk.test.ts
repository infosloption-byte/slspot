import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_RISK_LIMITS,
  computeReserve,
  evaluateRiskCaps,
  isCountryRestricted,
  looseningChanges,
  parseRiskLimitsInput,
  payoutRateFor,
  profitAtRisk,
  riskLimitsFromRecord,
  summarizeOpenRisk,
  utilization,
  RiskInputError,
  type RiskLimits,
} from './risk.js'

const limits = (over: Partial<RiskLimits> = {}): RiskLimits => ({ ...riskLimitsFromRecord(null), ...over })
const valid = () => ({ ...riskLimitsFromRecord(null) })

describe('profit at risk', () => {
  it('is the stake times the payout rate, exactly', () => {
    assert.equal(profitAtRisk('100', '0.88'), 8_800_000_000n)
    assert.equal(profitAtRisk('0.01', '0.80'), 800_000n)
  })
})

describe('reading stored settings', () => {
  it('falls back to safe defaults for a missing row or unreadable values', () => {
    assert.deepEqual(riskLimitsFromRecord(null).maxTradeAmount, DEFAULT_RISK_LIMITS.maxTradeAmount)
    const l = riskLimitsFromRecord({ maxTradeAmount: 'abc', maxUserOpenPositions: -3, payoutRates: { 'BTC/USD': '0.9', bad: 'x' }, restrictedCountries: ['lk', 'US', 5] })
    assert.equal(l.maxTradeAmount, DEFAULT_RISK_LIMITS.maxTradeAmount)
    assert.equal(l.maxUserOpenPositions, DEFAULT_RISK_LIMITS.maxUserOpenPositions)
    assert.deepEqual(l.payoutRates, { 'BTC/USD': '0.9' })
    assert.deepEqual(l.restrictedCountries, ['US'])
  })

  it('uses the default country list only when none was ever stored; an empty list means no restrictions', () => {
    assert.ok(riskLimitsFromRecord({}).restrictedCountries.includes('US'))
    assert.deepEqual(riskLimitsFromRecord({ restrictedCountries: [] }).restrictedCountries, [])
  })

  it('reads Decimal-like values', () => {
    const l = riskLimitsFromRecord({ maxTradeAmount: { toString: () => '25.5' } })
    assert.equal(l.maxTradeAmount, '25.50000000')
  })
})

describe('validating admin input', () => {
  it('accepts a complete, consistent object and normalises it', () => {
    const parsed = parseRiskLimitsInput({ ...valid(), restrictedCountries: ['us', 'US', 'lk'], payoutRates: { 'BTC/USD': '0.85' } })
    assert.deepEqual(parsed.restrictedCountries, ['US', 'LK'])
    assert.equal(parsed.payoutRates['BTC/USD'], '0.85')
  })

  const bad = (over: Record<string, unknown>) => assert.throws(() => parseRiskLimitsInput({ ...valid(), ...over }), RiskInputError)

  it('rejects inconsistent or out-of-range values', () => {
    bad({ minTradeAmount: '200' })
    bad({ maxTradeAmount: '0' })
    bad({ maxTradeAmount: '-5' })
    bad({ maxTradeAmount: '1e3' })
    bad({ maxUserOpenExposure: '10' })
    bad({ maxDirectionOpenProfit: '5000' })
    bad({ maxAssetOpenProfit: '9000' })
    bad({ maxUserOpenPositions: 0 })
    bad({ maxUserOpenPositions: 1.5 })
    bad({ alertKycReviewHours: 0 })
    bad({ payoutRates: { 'BTC/USD': '0.99' } })
    bad({ payoutRates: { 'BTC/USD': '0.01' } })
    bad({ payoutRates: { btc: '0.8' } })
    bad({ restrictedCountries: ['USA'] })
    bad({ restrictedCountries: 'US' })
    assert.throws(() => parseRiskLimitsInput(null), RiskInputError)
  })
})

describe('payout rates', () => {
  it('prefers an admin override, then the built-in rate, then the fallback', () => {
    assert.equal(payoutRateFor('BTC/USD', { payoutRates: { 'BTC/USD': '0.70' } }), '0.70')
    assert.equal(payoutRateFor('BTC/USD', { payoutRates: {} }), '0.88')
    assert.equal(payoutRateFor('NEW/USD', { payoutRates: {} }), '0.80')
  })
})

describe('loosening detection', () => {
  const base = limits()
  it('treats lowering as safe', () => {
    assert.deepEqual(looseningChanges(base, limits({ maxTradeAmount: '50.00000000', maxUserOpenPositions: 5, restrictedCountries: [...base.restrictedCountries, 'LK'], payoutRates: { 'BTC/USD': '0.80' } })), [])
  })
  it('flags higher caps, higher payouts and removed countries', () => {
    const next = limits({
      maxTradeAmount: '150.00000000',
      maxPlatformOpenProfit: '3000.00000000',
      maxUserOpenPositions: 20,
      payoutRates: { 'ETH/USD': '0.90' },
      restrictedCountries: base.restrictedCountries.filter((c) => c !== 'US'),
    })
    const changes = looseningChanges(base, next)
    for (const expected of ['maxTradeAmount', 'maxPlatformOpenProfit', 'maxUserOpenPositions', 'payout ETH/USD', 'country US']) assert.ok(changes.includes(expected), expected)
  })
  it('flags a payout raised by clearing an override that was lower than the default', () => {
    const lowered = limits({ payoutRates: { 'BTC/USD': '0.70' } })
    assert.ok(looseningChanges(lowered, limits({ payoutRates: {} })).includes('payout BTC/USD'))
  })
})

describe('open exposure caps', () => {
  const l = limits({ maxPlatformOpenProfit: '100.00000000', maxAssetOpenProfit: '60.00000000', maxDirectionOpenProfit: '40.00000000', maxUserOpenExposure: '200.00000000', maxUserOpenPositions: 3, maxTradeAmount: '100.00000000' })
  const open = summarizeOpenRisk([
    { assetId: 'btc', side: 'BUY', amount: '50', payoutRate: '0.80' }, // 40 profit
    { assetId: 'btc', side: 'SELL', amount: '20', payoutRate: '0.80' }, // 16 profit
    { assetId: 'eth', side: 'BUY', amount: '10', payoutRate: '0.80' }, // 8 profit
  ])
  const check = (over: Record<string, unknown>) => evaluateRiskCaps({ limits: l, amount: '10', payoutRate: '0.80', side: 'BUY', assetId: 'sol', open, userOpenExposure: '0', userOpenCount: 0, ...over })

  it('sums profit overall, per asset and per direction', () => {
    assert.equal(open.platformProfit, 6_400_000_000n)
    assert.equal(open.byAsset.get('btc'), 5_600_000_000n)
    assert.equal(open.byDirection.get('btc:BUY'), 4_000_000_000n)
  })
  it('accepts a trade that fits every cap, up to the cap exactly', () => {
    assert.equal(check({}), null)
    assert.equal(check({ amount: '45', assetId: 'sol' }), null) // 36 profit -> platform 100.0 exactly
  })
  it('rejects the first cap that would be broken', () => {
    assert.equal(check({ userOpenCount: 3 })?.cap, 'USER_POSITIONS')
    assert.equal(check({ userOpenExposure: '195' })?.cap, 'USER_EXPOSURE')
    assert.equal(check({ amount: '46', assetId: 'sol' })?.cap, 'PLATFORM')
    assert.equal(check({ amount: '10', assetId: 'btc', side: 'SELL' })?.cap, 'ASSET') // 56 + 8 > 60
    assert.equal(check({ amount: '10', assetId: 'eth', side: 'BUY', open: summarizeOpenRisk([{ assetId: 'eth', side: 'BUY', amount: '45', payoutRate: '0.80' }]) })?.cap, 'DIRECTION') // 36 + 8 > 40
  })
  it('does not reveal the configured limits in customer messages', () => {
    const message = check({ amount: '46', assetId: 'sol' })?.message ?? ''
    assert.ok(!/\d{3}/.test(message))
  })
})

describe('reserve and utilisation', () => {
  it('adds the profit owed on open trades to customer funds', () => {
    assert.deepEqual(computeReserve({ availableBalances: '900', heldBalances: '100', openStake: '30', openMaxPayout: '56' }), { customerFunds: '1000.00000000', openProfitAtRisk: '26.00000000', requiredReserve: '1026.00000000' })
    assert.equal(computeReserve({ availableBalances: '0', heldBalances: '0', openStake: '30', openMaxPayout: '10' }).openProfitAtRisk, '0.00000000')
  })
  it('reports percent used and treats a zero cap as full', () => {
    assert.equal(utilization(5_000_000_000n, '100').percent, 50)
    assert.equal(utilization(1n, '0').percent, 100)
  })
})

describe('restricted countries', () => {
  it('matches case-insensitively and ignores unknown countries', () => {
    const l2 = { restrictedCountries: ['US'] }
    assert.equal(isCountryRestricted('us', l2), true)
    assert.equal(isCountryRestricted('LK', l2), false)
    assert.equal(isCountryRestricted(null, l2), false)
  })
})
