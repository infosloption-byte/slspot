import type { Prisma, PrismaClient } from '../generated/prisma/client.js'

/**
 * Platform earnings report for administrators. REAL-money activity only: demo wallets never count.
 *
 * Definitions (all in USD, the only wallet currency):
 * - House trading result = stakes forfeited on lost trades minus profit paid on won trades, i.e. the
 *   negative of the customers' gross trade P&L. Draws and voided trades contribute nothing.
 * - Fee revenue = fees charged on settled or voided trades.
 * - Platform earnings = house trading result + fee revenue.
 * - Deposits and withdrawals are counted on the day they COMPLETED. Requested withdrawals are counted on the day
 *   they were requested. Pending money is a snapshot of right now, not a daily figure.
 *
 * Amounts are handled as integers in 1e-8 units so sums are exact. A "day" is a calendar day in the administrator's
 * own time zone, given as a fixed offset from UTC.
 */

const SCALE = 8
const UNIT = 10n ** BigInt(SCALE)
const DAY_MS = 24 * 60 * 60 * 1000
export const MAX_RANGE_DAYS = 92
export const ROW_LIMIT = 100_000

export type EarningsRange = { from: string; to: string; offsetMinutes: number }

export class EarningsInputError extends Error {
  readonly statusCode = 400
  readonly code = 'INVALID_RANGE'
  constructor(message: string) {
    super(message)
    this.name = 'EarningsInputError'
  }
}

// ---------------------------------------------------------------- number helpers

/** Parse a plain decimal string such as "-12.5" into 1e-8 units. Extra digits beyond 8 places are truncated. */
export function toUnits(value: string | null | undefined): bigint {
  if (value === null || value === undefined || value === '') return 0n
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!match) throw new Error('Not a plain decimal: ' + value)
  const whole = BigInt(match[2] ?? '0')
  const fraction = BigInt((match[3] ?? '').padEnd(SCALE, '0').slice(0, SCALE) || '0')
  const units = whole * UNIT + fraction
  return match[1] === '-' ? -units : units
}

export function fromUnits(units: bigint): string {
  const negative = units < 0n
  const absolute = negative ? -units : units
  const whole = absolute / UNIT
  const fraction = (absolute % UNIT).toString().padStart(SCALE, '0')
  return (negative ? '-' : '') + whole.toString() + '.' + fraction
}

// ---------------------------------------------------------------- dates

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new EarningsInputError('Dates must look like 2026-10-31')
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const time = Date.UTC(year, month - 1, day)
  const check = new Date(time)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new EarningsInputError('That date does not exist')
  return time
}

function formatDay(time: number): string {
  const date = new Date(time)
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate())
}

/** The calendar day a moment falls on, for an administrator whose clock is offsetMinutes ahead of UTC. */
export function dayKey(at: Date, offsetMinutes: number): string {
  return formatDay(Math.floor((at.getTime() + offsetMinutes * 60_000) / DAY_MS) * DAY_MS)
}

/** Normalise the requested range. Defaults to the last 30 days ending today in the administrator's time zone. */
export function resolveRange(input: { from?: string; to?: string; offsetMinutes?: number }, now: Date): EarningsRange & { startUtc: Date; endUtc: Date; days: string[] } {
  const offsetMinutes = input.offsetMinutes === undefined ? 0 : Math.trunc(input.offsetMinutes)
  if (!Number.isFinite(offsetMinutes) || offsetMinutes < -840 || offsetMinutes > 840) throw new EarningsInputError('Time zone offset is out of range')
  const today = dayKey(now, offsetMinutes)
  const toTime = parseDay(input.to ?? today)
  const fromTime = parseDay(input.from ?? formatDay(toTime - 29 * DAY_MS))
  if (fromTime > toTime) throw new EarningsInputError('The start date must not be after the end date')
  const count = Math.round((toTime - fromTime) / DAY_MS) + 1
  if (count > MAX_RANGE_DAYS) throw new EarningsInputError('Choose a range of at most ' + MAX_RANGE_DAYS + ' days')
  const days: string[] = []
  for (let index = 0; index < count; index += 1) days.push(formatDay(fromTime + index * DAY_MS))
  return {
    from: formatDay(fromTime),
    to: formatDay(toTime),
    offsetMinutes,
    startUtc: new Date(fromTime - offsetMinutes * 60_000),
    endUtc: new Date(toTime + DAY_MS - offsetMinutes * 60_000),
    days,
  }
}

// ---------------------------------------------------------------- report

export type TradeRow = { status: 'WON' | 'LOST' | 'DRAW' | 'CANCELLED'; grossPnl: string | null; fee: string; stake: string; closedAt: Date }
export type MoneyRow = { provider: string; amount: string; at: Date }
export type RequestedWithdrawalRow = { provider: string; amount: string; status: string; at: Date }

export type EarningsSnapshot = {
  pendingWithdrawals: { count: number; amount: string; awaitingReview: number; oldestRequestedAt: string | null }
  pendingDeposits: { count: number; amount: string }
  openTrades: { count: number; stake: string; maxPayout: string }
  customerBalances: { available: string; held: string }
}

export type EarningsAllTime = { houseResult: string; feeRevenue: string; earnings: string; deposits: string; withdrawals: string; netCashFlow: string }

export type EarningsInput = {
  range: EarningsRange & { days: string[] }
  trades: TradeRow[]
  deposits: MoneyRow[]
  withdrawalsCompleted: MoneyRow[]
  withdrawalsRequested: RequestedWithdrawalRow[]
  truncated: boolean
  snapshot: EarningsSnapshot
  allTime: EarningsAllTime
}

type Money = { count: number; amount: string }
export type EarningsDay = {
  date: string
  tradesSettled: number
  volume: string
  wins: number
  losses: number
  draws: number
  voided: number
  houseResult: string
  feeRevenue: string
  earnings: string
  deposits: Money
  withdrawals: Money
  withdrawalsRequested: Money
  netCashFlow: string
}

export type EarningsReport = {
  currency: 'USD'
  range: EarningsRange
  /** True when a row limit cut the data short, so the figures are incomplete. */
  truncated: boolean
  totals: Omit<EarningsDay, 'date'> & { houseMargin: string | null; withdrawalsRejected: Money }
  days: EarningsDay[]
  providers: Array<{ provider: string; deposits: Money; withdrawals: Money }>
  snapshot: EarningsSnapshot
  allTime: EarningsAllTime
}

type DayAccumulator = {
  tradesSettled: number
  volume: bigint
  wins: number
  losses: number
  draws: number
  voided: number
  houseResult: bigint
  feeRevenue: bigint
  deposits: { count: number; amount: bigint }
  withdrawals: { count: number; amount: bigint }
  requested: { count: number; amount: bigint }
  rejected: { count: number; amount: bigint }
}

function emptyAccumulator(): DayAccumulator {
  return {
    tradesSettled: 0,
    volume: 0n,
    wins: 0,
    losses: 0,
    draws: 0,
    voided: 0,
    houseResult: 0n,
    feeRevenue: 0n,
    deposits: { count: 0, amount: 0n },
    withdrawals: { count: 0, amount: 0n },
    requested: { count: 0, amount: 0n },
    rejected: { count: 0, amount: 0n },
  }
}

function money(value: { count: number; amount: bigint }): Money {
  return { count: value.count, amount: fromUnits(value.amount) }
}

function present(date: string, value: DayAccumulator): EarningsDay {
  const earnings = value.houseResult + value.feeRevenue
  return {
    date,
    tradesSettled: value.tradesSettled,
    volume: fromUnits(value.volume),
    wins: value.wins,
    losses: value.losses,
    draws: value.draws,
    voided: value.voided,
    houseResult: fromUnits(value.houseResult),
    feeRevenue: fromUnits(value.feeRevenue),
    earnings: fromUnits(earnings),
    deposits: money(value.deposits),
    withdrawals: money(value.withdrawals),
    withdrawalsRequested: money(value.requested),
    netCashFlow: fromUnits(value.deposits.amount - value.withdrawals.amount),
  }
}

export function buildEarningsReport(input: EarningsInput): EarningsReport {
  const { offsetMinutes } = input.range
  const byDay = new Map<string, DayAccumulator>(input.range.days.map((day) => [day, emptyAccumulator()]))
  const total = emptyAccumulator()
  const providers = new Map<string, { deposits: { count: number; amount: bigint }; withdrawals: { count: number; amount: bigint } }>()
  const provider = (name: string) => {
    let entry = providers.get(name)
    if (!entry) {
      entry = { deposits: { count: 0, amount: 0n }, withdrawals: { count: 0, amount: 0n } }
      providers.set(name, entry)
    }
    return entry
  }
  const apply = (at: Date, change: (target: DayAccumulator) => void) => {
    const target = byDay.get(dayKey(at, offsetMinutes))
    // Rows outside the requested days (a boundary effect of the query) are ignored rather than miscounted.
    if (!target) return
    change(target)
    change(total)
  }

  for (const trade of input.trades) {
    apply(trade.closedAt, (target) => {
      target.tradesSettled += 1
      target.volume += toUnits(trade.stake)
      target.feeRevenue += toUnits(trade.fee)
      // The house result is the opposite of the customer's gross P&L.
      target.houseResult -= toUnits(trade.grossPnl)
      if (trade.status === 'WON') target.wins += 1
      else if (trade.status === 'LOST') target.losses += 1
      else if (trade.status === 'DRAW') target.draws += 1
      else target.voided += 1
    })
  }
  for (const row of input.deposits) {
    const units = toUnits(row.amount)
    apply(row.at, (target) => {
      target.deposits.count += 1
      target.deposits.amount += units
    })
    if (byDay.has(dayKey(row.at, offsetMinutes))) {
      const entry = provider(row.provider)
      entry.deposits.count += 1
      entry.deposits.amount += units
    }
  }
  for (const row of input.withdrawalsCompleted) {
    const units = toUnits(row.amount)
    apply(row.at, (target) => {
      target.withdrawals.count += 1
      target.withdrawals.amount += units
    })
    if (byDay.has(dayKey(row.at, offsetMinutes))) {
      const entry = provider(row.provider)
      entry.withdrawals.count += 1
      entry.withdrawals.amount += units
    }
  }
  for (const row of input.withdrawalsRequested) {
    const units = toUnits(row.amount)
    apply(row.at, (target) => {
      target.requested.count += 1
      target.requested.amount += units
      if (row.status === 'REJECTED' || row.status === 'FAILED') {
        target.rejected.count += 1
        target.rejected.amount += units
      }
    })
  }

  const days = input.range.days.map((day) => present(day, byDay.get(day) ?? emptyAccumulator()))
  const { date: _date, ...totals } = present('total', total)
  void _date
  return {
    currency: 'USD',
    range: { from: input.range.from, to: input.range.to, offsetMinutes },
    truncated: input.truncated,
    totals: {
      ...totals,
      // Earnings as a share of the money staked. Null when nothing was staked.
      houseMargin: total.volume > 0n ? ((Number((total.houseResult + total.feeRevenue) * 10_000n / total.volume)) / 100).toFixed(2) : null,
      withdrawalsRejected: money(total.rejected),
    },
    days,
    providers: [...providers.entries()]
      .map(([name, value]) => ({ provider: name, deposits: money(value.deposits), withdrawals: money(value.withdrawals) }))
      .sort((a, b) => a.provider.localeCompare(b.provider)),
    snapshot: input.snapshot,
    allTime: input.allTime,
  }
}

// ---------------------------------------------------------------- loading

type Decimalish = { toFixed(places: number): string }
const fixed = (value: Decimalish | null | undefined): string => (value ? value.toFixed(SCALE) : '0.' + '0'.repeat(SCALE))

const REAL_TRADES: Prisma.TradeWhereInput = { position: { account: { mode: 'REAL' } } }
const SETTLED: Array<'WON' | 'LOST' | 'DRAW' | 'CANCELLED'> = ['WON', 'LOST', 'DRAW', 'CANCELLED']
const REAL_WALLET = { account: { mode: 'REAL' as const } }

export async function loadEarnings(prisma: PrismaClient, input: { from?: string; to?: string; offsetMinutes?: number }, now: Date = new Date()): Promise<EarningsReport> {
  const range = resolveRange(input, now)
  const window = { gte: range.startUtc, lt: range.endUtc }

  const [trades, deposits, completedWithdrawals, requestedWithdrawals, pendingWithdrawals, pendingDeposits, openTrades, balances, tradeTotals, depositTotals, withdrawalTotals] = await Promise.all([
    prisma.trade.findMany({
      where: { ...REAL_TRADES, status: { in: SETTLED }, closedAt: window },
      select: { status: true, grossPnl: true, fee: true, closedAt: true, position: { select: { amount: true } } },
      take: ROW_LIMIT + 1,
    }),
    prisma.deposit.findMany({
      where: { wallet: REAL_WALLET, status: 'COMPLETED', completedAt: window },
      select: { provider: true, amount: true, completedAt: true },
      take: ROW_LIMIT + 1,
    }),
    prisma.withdrawal.findMany({
      where: { wallet: REAL_WALLET, status: 'COMPLETED', completedAt: window },
      select: { provider: true, amount: true, completedAt: true },
      take: ROW_LIMIT + 1,
    }),
    prisma.withdrawal.findMany({
      where: { wallet: REAL_WALLET, requestedAt: window },
      select: { provider: true, amount: true, status: true, requestedAt: true },
      take: ROW_LIMIT + 1,
    }),
    prisma.withdrawal.findMany({
      where: { wallet: REAL_WALLET, status: { in: ['PENDING', 'PROCESSING'] } },
      select: { amount: true, details: true, requestedAt: true },
      take: ROW_LIMIT,
    }),
    prisma.deposit.aggregate({ where: { wallet: REAL_WALLET, status: { in: ['PENDING', 'PROCESSING'] } }, _sum: { amount: true }, _count: true }),
    prisma.trade.findMany({
      where: { ...REAL_TRADES, status: 'OPEN' },
      select: { position: { select: { amount: true, order: { select: { payoutRate: true } } } } },
      take: ROW_LIMIT,
    }),
    prisma.wallet.aggregate({ where: REAL_WALLET, _sum: { availableBalance: true, heldBalance: true } }),
    prisma.trade.aggregate({ where: { ...REAL_TRADES, status: { in: SETTLED } }, _sum: { grossPnl: true, fee: true } }),
    prisma.deposit.aggregate({ where: { wallet: REAL_WALLET, status: 'COMPLETED' }, _sum: { amount: true } }),
    prisma.withdrawal.aggregate({ where: { wallet: REAL_WALLET, status: 'COMPLETED' }, _sum: { amount: true } }),
  ])

  const truncated = [trades, deposits, completedWithdrawals, requestedWithdrawals].some((rows) => rows.length > ROW_LIMIT)

  // Open trades: money at stake now, and the most the house would pay out if every one of them won.
  let openStake = 0n
  let openPayout = 0n
  for (const trade of openTrades) {
    const stake = toUnits(fixed(trade.position.amount))
    openStake += stake
    openPayout += stake + (stake * toUnits(fixed(trade.position.order.payoutRate))) / UNIT
  }

  let pendingAmount = 0n
  let awaitingReview = 0
  let oldest: Date | null = null
  for (const row of pendingWithdrawals) {
    pendingAmount += toUnits(fixed(row.amount))
    const details = row.details as { needsReview?: unknown } | null
    if (details && typeof details === 'object' && details.needsReview === true) awaitingReview += 1
    if (!oldest || row.requestedAt < oldest) oldest = row.requestedAt
  }

  const houseResult = -toUnits(fixed(tradeTotals._sum.grossPnl))
  const feeRevenue = toUnits(fixed(tradeTotals._sum.fee))
  const depositsTotal = toUnits(fixed(depositTotals._sum.amount))
  const withdrawalsTotal = toUnits(fixed(withdrawalTotals._sum.amount))

  return buildEarningsReport({
    range,
    truncated,
    trades: trades.slice(0, ROW_LIMIT).flatMap((trade) => (trade.closedAt && trade.status !== 'OPEN'
      ? [{ status: trade.status as TradeRow['status'], grossPnl: trade.grossPnl ? fixed(trade.grossPnl) : null, fee: fixed(trade.fee), stake: fixed(trade.position.amount), closedAt: trade.closedAt }]
      : [])),
    deposits: deposits.slice(0, ROW_LIMIT).flatMap((row) => (row.completedAt ? [{ provider: row.provider, amount: fixed(row.amount), at: row.completedAt }] : [])),
    withdrawalsCompleted: completedWithdrawals.slice(0, ROW_LIMIT).flatMap((row) => (row.completedAt ? [{ provider: row.provider, amount: fixed(row.amount), at: row.completedAt }] : [])),
    withdrawalsRequested: requestedWithdrawals.slice(0, ROW_LIMIT).map((row) => ({ provider: row.provider, amount: fixed(row.amount), status: row.status, at: row.requestedAt })),
    snapshot: {
      pendingWithdrawals: { count: pendingWithdrawals.length, amount: fromUnits(pendingAmount), awaitingReview, oldestRequestedAt: oldest ? oldest.toISOString() : null },
      pendingDeposits: { count: pendingDeposits._count, amount: fromUnits(toUnits(fixed(pendingDeposits._sum.amount))) },
      openTrades: { count: openTrades.length, stake: fromUnits(openStake), maxPayout: fromUnits(openPayout) },
      customerBalances: { available: fromUnits(toUnits(fixed(balances._sum.availableBalance))), held: fromUnits(toUnits(fixed(balances._sum.heldBalance))) },
    },
    allTime: {
      houseResult: fromUnits(houseResult),
      feeRevenue: fromUnits(feeRevenue),
      earnings: fromUnits(houseResult + feeRevenue),
      deposits: fromUnits(depositsTotal),
      withdrawals: fromUnits(withdrawalsTotal),
      netCashFlow: fromUnits(depositsTotal - withdrawalsTotal),
    },
  })
}
