import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { riskLimitsFromRecord, summarizeOpenRisk } from '../trading/risk.js'
import { evaluateAlerts, type AlertInput } from './alerts.js'

const now = new Date('2026-10-13T12:00:00Z')
const base = (over: Partial<AlertInput> = {}): AlertInput => ({
  settlementBalance: '10.00000000',
  open: summarizeOpenRisk([]),
  limits: riskLimitsFromRecord({ maxPlatformOpenProfit: 100, maxAssetOpenProfit: 100, maxDirectionOpenProfit: 100 }),
  assetNames: new Map([['btc', 'BTC/USD']]),
  kycInReview: { count: 0, oldestSubmittedAt: null },
  now,
  ...over,
})

describe('alerts', () => {
  it('is quiet when everything is fine', () => {
    assert.deepEqual(evaluateAlerts(base()), [])
  })

  it('raises a critical alert when the settlement account goes negative', () => {
    const alerts = evaluateAlerts(base({ settlementBalance: '-0.00000001' }))
    assert.equal(alerts[0]?.code, 'SETTLEMENT_NEGATIVE')
    assert.equal(alerts[0]?.severity, 'CRITICAL')
    assert.deepEqual(evaluateAlerts(base({ settlementBalance: '0.00000000' })), [])
    assert.deepEqual(evaluateAlerts(base({ settlementBalance: null })), [])
    assert.equal(evaluateAlerts(base({ settlementBalance: '5', settlementFloor: '10' }))[0]?.code, 'SETTLEMENT_NEGATIVE')
  })

  it('warns at 80% of a cap and goes critical when it is full', () => {
    const near = evaluateAlerts(base({ open: summarizeOpenRisk([{ assetId: 'btc', side: 'BUY', amount: '100', payoutRate: '0.80' }]) }))
    assert.ok(near.some((a) => a.code === 'CAP_NEAR' && a.title.includes('BTC/USD up')))
    assert.ok(near.every((a) => a.severity === 'WARNING'))
    const full = evaluateAlerts(base({ open: summarizeOpenRisk([{ assetId: 'btc', side: 'BUY', amount: '125', payoutRate: '0.80' }]) }))
    assert.ok(full.some((a) => a.code === 'CAP_REACHED' && a.severity === 'CRITICAL'))
    assert.equal(full[0]?.severity, 'CRITICAL')
  })

  it('has a stable key per problem so it can be de-duplicated', () => {
    const open = summarizeOpenRisk([{ assetId: 'btc', side: 'BUY', amount: '100', payoutRate: '0.80' }])
    const keys = evaluateAlerts(base({ open })).map((a) => a.key)
    assert.deepEqual(keys, evaluateAlerts(base({ open })).map((a) => a.key))
    assert.equal(new Set(keys).size, keys.length)
  })

  it('flags identity checks waiting longer than the configured hours', () => {
    const waiting = (hours: number) => evaluateAlerts(base({ kycInReview: { count: 3, oldestSubmittedAt: new Date(now.getTime() - hours * 3_600_000) } }))
    assert.deepEqual(waiting(23), [])
    const alerts = waiting(25)
    assert.equal(alerts[0]?.code, 'KYC_STUCK')
    assert.ok(alerts[0]?.message.startsWith('3 identity checks'))
  })
})
