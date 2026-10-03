import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Prisma } from '../generated/prisma/client.js'
import { assertBalancedLedgerLines, signedLedgerAmount } from './service.js'

describe('financial ledger invariants', () => {
  it('requires at least two balanced entries', () => {
    const amount = new Prisma.Decimal('10.25')

    assert.doesNotThrow(() => {
      assertBalancedLedgerLines([
        {
          accountCode: 'USER:AVAILABLE',
          accountName: 'User available balance',
          accountType: 'LIABILITY',
          direction: 'DEBIT',
          amount,
        },
        {
          accountCode: 'SYSTEM:FUNDING',
          accountName: 'Funding source',
          accountType: 'EQUITY',
          direction: 'CREDIT',
          amount,
        },
      ], 'USD')
    })

    assert.throws(
      () => assertBalancedLedgerLines([
        {
          accountCode: 'USER:AVAILABLE',
          accountName: 'User available balance',
          accountType: 'LIABILITY',
          direction: 'DEBIT',
          amount,
        },
      ], 'USD'),
      /at least two entries/,
    )
  })

  it('rejects unbalanced or non-positive entries', () => {
    assert.throws(
      () => assertBalancedLedgerLines([
        {
          accountCode: 'USER:AVAILABLE',
          accountName: 'User available balance',
          accountType: 'LIABILITY',
          direction: 'DEBIT',
          amount: '10',
        },
        {
          accountCode: 'SYSTEM:FUNDING',
          accountName: 'Funding source',
          accountType: 'EQUITY',
          direction: 'CREDIT',
          amount: '9.99',
        },
      ], 'USD'),
      /not balanced/,
    )

    assert.throws(
      () => assertBalancedLedgerLines([
        {
          accountCode: 'USER:AVAILABLE',
          accountName: 'User available balance',
          accountType: 'LIABILITY',
          direction: 'DEBIT',
          amount: '0',
        },
        {
          accountCode: 'SYSTEM:FUNDING',
          accountName: 'Funding source',
          accountType: 'EQUITY',
          direction: 'CREDIT',
          amount: '0',
        },
      ], 'USD'),
      /amount must be positive/,
    )
  })

  it('computes signed balances consistently', () => {
    assert.equal(signedLedgerAmount('CREDIT', '12.50').toString(), '12.5')
    assert.equal(signedLedgerAmount('DEBIT', '12.50').toString(), '-12.5')
  })
})
