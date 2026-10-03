import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertManualSettlementAllowed,
  calculateSettlementTerms,
  evaluateTrade,
  TradingError,
} from './service.js'

test('UP wins when settlement price is equal to entry', () => {
  assert.equal(evaluateTrade('UP', '100', '100'), true)
  assert.equal(evaluateTrade('UP', '100', '99.99'), false)
})

test('DOWN wins when settlement price is equal to entry', () => {
  assert.equal(evaluateTrade('DOWN', '100', '100'), true)
  assert.equal(evaluateTrade('DOWN', '100', '100.01'), false)
})

test('winning settlement returns stake plus profit and subtracts fee from P&L', () => {
  const terms = calculateSettlementTerms({
    amount: '50',
    payoutRate: '0.88',
    fee: '1',
    won: true,
  })

  assert.equal(terms.profit.toFixed(2), '44.00')
  assert.equal(terms.grossPnl.toFixed(2), '44.00')
  assert.equal(terms.grossPayout.toFixed(2), '94.00')
  assert.equal(terms.netPnl.toFixed(2), '43.00')
  assert.equal(terms.holdAmount.toFixed(2), '50.00')
})

test('losing settlement releases no payout and records the stake loss plus fee', () => {
  const terms = calculateSettlementTerms({
    amount: '50',
    payoutRate: '0.88',
    fee: '1',
    won: false,
  })

  assert.equal(terms.grossPayout.toFixed(2), '0.00')
  assert.equal(terms.grossPnl.toFixed(2), '-50.00')
  assert.equal(terms.netPnl.toFixed(2), '-51.00')
  assert.equal(terms.holdAmount.toFixed(2), '50.00')
})


test('manual settlement is rejected before expiry', () => {
  assert.throws(
    () => assertManualSettlementAllowed(new Date('2026-10-03T12:05:00.000Z'), new Date('2026-10-03T12:04:59.000Z')),
    (error: unknown) => error instanceof TradingError
      && error.code === 'TRADE_NOT_EXPIRED'
      && error.statusCode === 409,
  )
})

test('manual settlement is allowed at and after expiry', () => {
  assert.doesNotThrow(() => {
    assertManualSettlementAllowed(new Date('2026-10-03T12:05:00.000Z'), new Date('2026-10-03T12:05:00.000Z'))
    assertManualSettlementAllowed(new Date('2026-10-03T12:05:00.000Z'), new Date('2026-10-03T12:05:01.000Z'))
  })
})
