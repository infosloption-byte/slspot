import assert from 'node:assert/strict'
import test from 'node:test'
import type { PrismaClient } from '../generated/prisma/client.js'
import {
  assertManualSettlementAllowed,
  calculateSettlementTerms,
  evaluateTrade,
  TradingError,
  TradingService,
} from './service.js'

test('UP wins only when the settlement price is above entry', () => {
  assert.equal(evaluateTrade('UP', '100', '100.01'), 'WON')
  assert.equal(evaluateTrade('UP', '100', '99.99'), 'LOST')
})

test('DOWN wins only when the settlement price is below entry', () => {
  assert.equal(evaluateTrade('DOWN', '100', '99.99'), 'WON')
  assert.equal(evaluateTrade('DOWN', '100', '100.01'), 'LOST')
})

test('an unchanged price is a draw for both directions', () => {
  assert.equal(evaluateTrade('UP', '100', '100.000000'), 'DRAW')
  assert.equal(evaluateTrade('DOWN', '100', '100'), 'DRAW')
})

test('draw settlement returns the stake with no profit; only the fee is lost', () => {
  const terms = calculateSettlementTerms({ amount: '50', payoutRate: '0.88', fee: '1', outcome: 'DRAW' })
  assert.equal(terms.profit.toFixed(2), '0.00')
  assert.equal(terms.grossPnl.toFixed(2), '0.00')
  assert.equal(terms.grossPayout.toFixed(2), '50.00')
  assert.equal(terms.netPnl.toFixed(2), '-1.00')
})

test('winning settlement returns stake plus profit and subtracts fee from P&L', () => {
  const terms = calculateSettlementTerms({
    amount: '50',
    payoutRate: '0.88',
    fee: '1',
    outcome: 'WON',
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
    outcome: 'LOST',
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

test('real-money launch gate rejects new REAL trades before transaction side effects', async () => {
  let transactionStarted = false
  const prisma = {
    order: { findUnique: async () => null },
    $transaction: async () => {
      transactionStarted = true
      throw new Error('REAL trade must not reach a transaction while the launch gate is closed')
    },
  } as unknown as PrismaClient
  const service = new TradingService(prisma, undefined, {
    launchApproved: false,
    tradingEnabled: true,
    depositsEnabled: true,
    withdrawalsEnabled: true,
  })

  await assert.rejects(
    service.createTrade('user-1', {
      clientRequestId: 'real-gate-regression',
      assetId: 'asset-1',
      direction: 'UP',
      amount: '10',
      durationSeconds: 60,
    }, 'REAL'),
    (error: unknown) => error instanceof TradingError
      && error.code === 'REAL_TRADING_DISABLED'
      && error.statusCode === 503,
  )
  assert.equal(transactionStarted, false)
})

test('administrative REAL-trading switch blocks creation inside the transaction', async () => {
  let userLookupStarted = false
  const prisma = {
    order: { findUnique: async () => null },
    $transaction: async (callback: (tx: unknown) => unknown) => {
      return callback({
        realMoneyGate: { findUnique: async () => ({ tradingEnabled: false }) },
        user: { findUnique: async () => {
          userLookupStarted = true
          return { status: 'ACTIVE' }
        } },
      })
    },
  } as unknown as PrismaClient
  const service = new TradingService(prisma, undefined, {
    launchApproved: true,
    tradingEnabled: true,
    depositsEnabled: false,
    withdrawalsEnabled: false,
  })

  await assert.rejects(
    service.createTrade('user-1', {
      clientRequestId: 'admin-real-gate-regression',
      assetId: 'asset-1',
      direction: 'UP',
      amount: '10',
      durationSeconds: 60,
    }, 'REAL'),
    (error: unknown) => error instanceof TradingError
      && error.code === 'REAL_TRADING_DISABLED'
      && error.statusCode === 503,
  )
  assert.equal(userLookupStarted, false)
})
