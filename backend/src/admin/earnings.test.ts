import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PrismaClient } from '../generated/prisma/client.js'
import { buildEarningsReport, dayKey, EarningsInputError, fromUnits, loadEarnings, resolveRange, toUnits, type EarningsInput } from './earnings.js'

const SNAPSHOT: EarningsInput['snapshot'] = {
  pendingWithdrawals: { count: 0, amount: '0.00000000', awaitingReview: 0, oldestRequestedAt: null },
  pendingDeposits: { count: 0, amount: '0.00000000' },
  openTrades: { count: 0, stake: '0.00000000', maxPayout: '0.00000000' },
  customerBalances: { available: '0.00000000', held: '0.00000000' },
}
const ALL_TIME: EarningsInput['allTime'] = { houseResult: '0.00000000', feeRevenue: '0.00000000', earnings: '0.00000000', deposits: '0.00000000', withdrawals: '0.00000000', netCashFlow: '0.00000000' }
const at = (value: string) => new Date(value)

describe('units', () => {
  it('round-trips exact decimals and handles signs', () => {
    assert.equal(toUnits('12.5'), 1_250_000_000n)
    assert.equal(fromUnits(toUnits('12.5')), '12.50000000')
    assert.equal(fromUnits(toUnits('-0.00000001')), '-0.00000001')
    assert.equal(toUnits(null), 0n)
    assert.equal(fromUnits(toUnits('0.1') + toUnits('0.2')), '0.30000000')
    assert.throws(() => toUnits('1e-8'))
  })
})

describe('range and days', () => {
  const now = at('2026-10-11T20:00:00Z')

  it('defaults to the last 30 days in the administrator time zone', () => {
    const utc = resolveRange({}, now)
    assert.equal(utc.to, '2026-10-11')
    assert.equal(utc.days.length, 30)
    assert.equal(utc.from, '2026-09-12')
    const colombo = resolveRange({ offsetMinutes: 330 }, now)
    assert.equal(colombo.to, '2026-10-12')
    assert.equal(colombo.startUtc.toISOString(), '2026-09-12T18:30:00.000Z')
    assert.equal(colombo.endUtc.toISOString(), '2026-10-12T18:30:00.000Z')
  })

  it('assigns a moment to the local calendar day', () => {
    assert.equal(dayKey(at('2026-10-11T19:00:00Z'), 330), '2026-10-12')
    assert.equal(dayKey(at('2026-10-11T19:00:00Z'), 0), '2026-10-11')
    assert.equal(dayKey(at('2026-10-11T03:00:00Z'), -300), '2026-10-10')
  })

  it('rejects impossible input', () => {
    const bad = (input: Parameters<typeof resolveRange>[0]) => assert.throws(() => resolveRange(input, now), EarningsInputError)
    bad({ from: '2026-02-30', to: '2026-03-01' })
    bad({ from: '2026-10-10', to: '2026-10-01' })
    bad({ from: '2026-01-01', to: '2026-10-01' })
    bad({ offsetMinutes: 900 })
    bad({ from: 'yesterday' })
  })
})

describe('buildEarningsReport', () => {
  const range = resolveRange({ from: '2026-10-10', to: '2026-10-12', offsetMinutes: 330 }, at('2026-10-12T10:00:00Z'))
  const input: EarningsInput = {
    range,
    truncated: false,
    snapshot: SNAPSHOT,
    allTime: ALL_TIME,
    trades: [
      // 2026-10-11 local: one win (house pays 8), one loss (house keeps 10), one draw, one void that kept a 0.5 fee
      { status: 'WON', grossPnl: '8', fee: '0', stake: '10', closedAt: at('2026-10-11T05:00:00Z') },
      { status: 'LOST', grossPnl: '-10', fee: '0.2', stake: '10', closedAt: at('2026-10-11T06:00:00Z') },
      { status: 'DRAW', grossPnl: '0', fee: '0', stake: '5', closedAt: at('2026-10-11T07:00:00Z') },
      { status: 'CANCELLED', grossPnl: '0', fee: '0.5', stake: '20', closedAt: at('2026-10-11T08:00:00Z') },
      // 18:45Z is already the next local day (2026-10-12)
      { status: 'LOST', grossPnl: '-100', fee: '0', stake: '100', closedAt: at('2026-10-11T18:45:00Z') },
      // outside the requested days: ignored
      { status: 'LOST', grossPnl: '-999', fee: '0', stake: '999', closedAt: at('2026-09-01T00:00:00Z') },
    ],
    deposits: [
      { provider: 'card', amount: '100', at: at('2026-10-11T05:00:00Z') },
      { provider: 'skrill', amount: '50.5', at: at('2026-10-11T09:00:00Z') },
      { provider: 'card', amount: '25', at: at('2026-10-12T01:00:00Z') },
    ],
    withdrawalsCompleted: [{ provider: 'card', amount: '40', at: at('2026-10-11T10:00:00Z') }],
    withdrawalsRequested: [
      { provider: 'card', amount: '40', status: 'COMPLETED', at: at('2026-10-11T09:00:00Z') },
      { provider: 'skrill', amount: '15', status: 'REJECTED', at: at('2026-10-11T09:30:00Z') },
      { provider: 'skrill', amount: '60', status: 'PENDING', at: at('2026-10-12T04:00:00Z') },
    ],
  }
  const report = buildEarningsReport(input)
  const day = (date: string) => report.days.find((item) => item.date === date)!

  it('lists every day in the range, including quiet ones', () => {
    assert.deepEqual(report.days.map((item) => item.date), ['2026-10-10', '2026-10-11', '2026-10-12'])
    assert.equal(day('2026-10-10').tradesSettled, 0)
    assert.equal(day('2026-10-10').earnings, '0.00000000')
  })

  it('computes the house result as the negative of customer gross P&L, plus fees', () => {
    const d = day('2026-10-11')
    assert.equal(d.houseResult, '2.00000000')
    assert.equal(d.feeRevenue, '0.70000000')
    assert.equal(d.earnings, '2.70000000')
    assert.equal(d.volume, '45.00000000')
    assert.deepEqual([d.wins, d.losses, d.draws, d.voided], [1, 1, 1, 1])
    assert.equal(day('2026-10-12').houseResult, '100.00000000')
  })

  it('counts money on the day it completed and reports net cash flow', () => {
    const d = day('2026-10-11')
    assert.deepEqual(d.deposits, { count: 2, amount: '150.50000000' })
    assert.deepEqual(d.withdrawals, { count: 1, amount: '40.00000000' })
    assert.equal(d.netCashFlow, '110.50000000')
    assert.deepEqual(day('2026-10-12').deposits, { count: 1, amount: '25.00000000' })
  })

  it('tracks requested and rejected withdrawals separately', () => {
    assert.deepEqual(day('2026-10-11').withdrawalsRequested, { count: 2, amount: '55.00000000' })
    assert.deepEqual(day('2026-10-12').withdrawalsRequested, { count: 1, amount: '60.00000000' })
    assert.deepEqual(report.totals.withdrawalsRejected, { count: 1, amount: '15.00000000' })
  })

  it('totals match the sum of the days and ignore rows outside the range', () => {
    assert.equal(report.totals.houseResult, '102.00000000')
    assert.equal(report.totals.feeRevenue, '0.70000000')
    assert.equal(report.totals.earnings, '102.70000000')
    assert.equal(report.totals.tradesSettled, 5)
    assert.equal(report.totals.volume, '145.00000000')
    assert.equal(report.totals.deposits.amount, '175.50000000')
    assert.equal(report.totals.houseMargin, '70.82')
  })

  it('splits money by provider', () => {
    assert.deepEqual(report.providers, [
      { provider: 'card', deposits: { count: 2, amount: '125.00000000' }, withdrawals: { count: 1, amount: '40.00000000' } },
      { provider: 'skrill', deposits: { count: 1, amount: '50.50000000' }, withdrawals: { count: 0, amount: '0.00000000' } },
    ])
  })

  it('reports no margin when nothing was staked, and carries the truncation flag', () => {
    const empty = buildEarningsReport({ ...input, trades: [], deposits: [], withdrawalsCompleted: [], withdrawalsRequested: [], truncated: true })
    assert.equal(empty.totals.houseMargin, null)
    assert.equal(empty.truncated, true)
    assert.equal(empty.totals.earnings, '0.00000000')
  })

  it('shows a loss day as negative earnings', () => {
    const loss = buildEarningsReport({ ...input, trades: [{ status: 'WON', grossPnl: '80', fee: '0', stake: '100', closedAt: at('2026-10-11T05:00:00Z') }] })
    assert.equal(loss.totals.houseResult, '-80.00000000')
    assert.equal(loss.totals.earnings, '-80.00000000')
  })
})

describe('loadEarnings', () => {
  const dec = (value: string) => ({ toFixed: (places: number) => Number(value).toFixed(places) })
  const now = at('2026-10-12T10:00:00Z')

  function fakePrisma(overrides: { tradeCount?: number } = {}) {
    const queries: Record<string, unknown[]> = {}
    const record = (name: string, args: unknown) => { (queries[name] ??= []).push(args) }
    const prisma = {
      trade: {
        findMany: async (args: { where: { status: unknown } }) => {
          record('trade.findMany', args)
          if (args.where.status === 'OPEN') return [{ position: { amount: dec('10'), order: { payoutRate: dec('0.8') } } }, { position: { amount: dec('20'), order: { payoutRate: dec('0.9') } } }]
          return Array.from({ length: overrides.tradeCount ?? 1 }, () => ({ status: 'LOST', grossPnl: dec('-10'), fee: dec('0.1'), closedAt: at('2026-10-11T05:00:00Z'), position: { amount: dec('10') } }))
        },
        aggregate: async (args: unknown) => { record('trade.aggregate', args); return { _sum: { grossPnl: dec('-50'), fee: dec('1') } } },
      },
      deposit: {
        findMany: async (args: unknown) => { record('deposit.findMany', args); return [{ provider: 'card', amount: dec('100'), completedAt: at('2026-10-11T05:00:00Z') }] },
        aggregate: async (args: { where: { status: unknown } }) => {
          record('deposit.aggregate', args)
          return args.where.status === 'COMPLETED' ? { _sum: { amount: dec('500') } } : { _sum: { amount: dec('30') }, _count: 2 }
        },
      },
      withdrawal: {
        findMany: async (args: { where: { status?: unknown; requestedAt?: unknown } }) => {
          record('withdrawal.findMany', args)
          if (args.where.requestedAt) return [{ provider: 'card', amount: dec('40'), status: 'COMPLETED', requestedAt: at('2026-10-11T05:00:00Z') }]
          if (args.where.status === 'COMPLETED') return [{ provider: 'card', amount: dec('40'), completedAt: at('2026-10-11T06:00:00Z') }]
          return [
            { amount: dec('60'), details: { needsReview: true }, requestedAt: at('2026-10-10T00:00:00Z') },
            { amount: dec('15'), details: null, requestedAt: at('2026-10-11T00:00:00Z') },
          ]
        },
        aggregate: async (args: unknown) => { record('withdrawal.aggregate', args); return { _sum: { amount: dec('200') } } },
      },
      wallet: { aggregate: async (args: unknown) => { record('wallet.aggregate', args); return { _sum: { availableBalance: dec('900'), heldBalance: dec('100') } } } },
    } as unknown as PrismaClient
    return { prisma, queries }
  }

  it('assembles the snapshot, all-time totals and daily rows from the database results', async () => {
    const { prisma } = fakePrisma()
    const report = await loadEarnings(prisma, { from: '2026-10-11', to: '2026-10-11' }, now)
    assert.equal(report.days.length, 1)
    assert.equal(report.days[0]?.houseResult, '10.00000000')
    assert.deepEqual(report.snapshot.openTrades, { count: 2, stake: '30.00000000', maxPayout: '56.00000000' })
    assert.deepEqual(report.snapshot.pendingWithdrawals, { count: 2, amount: '75.00000000', awaitingReview: 1, oldestRequestedAt: '2026-10-10T00:00:00.000Z' })
    assert.deepEqual(report.snapshot.pendingDeposits, { count: 2, amount: '30.00000000' })
    assert.deepEqual(report.snapshot.customerBalances, { available: '900.00000000', held: '100.00000000' })
    assert.equal(report.allTime.houseResult, '50.00000000')
    assert.equal(report.allTime.earnings, '51.00000000')
    assert.equal(report.allTime.netCashFlow, '300.00000000')
    assert.equal(report.truncated, false)
  })

  it('only ever queries real-money accounts', async () => {
    const { prisma, queries } = fakePrisma()
    await loadEarnings(prisma, {}, now)
    const text = JSON.stringify(queries)
    assert.equal(text.includes('"mode":"DEMO"'), false)
    for (const [name, calls] of Object.entries(queries)) {
      for (const call of calls) assert.ok(JSON.stringify(call).includes('"mode":"REAL"'), name + ' must filter on REAL accounts')
    }
  })

  it('flags truncation when a query hits the row limit', async () => {
    const { prisma } = fakePrisma({ tradeCount: 100_001 })
    const report = await loadEarnings(prisma, { from: '2026-10-11', to: '2026-10-11' }, now)
    assert.equal(report.truncated, true)
    assert.equal(report.totals.tradesSettled, 100_000)
  })
})
