import { fromUnits, toUnits, UNIT } from '../lib/units.js'

/**
 * Platform risk controls.
 *
 * What the platform can lose on an open trade is the PROFIT it would owe if the customer wins: stake x payout rate.
 * (The stake itself is already held in the customer's wallet.) The caps below limit that exposure per user, per asset,
 * per asset and direction, and across the whole platform, so a lucky streak or one large customer cannot exceed what the
 * operator has decided to risk. Payout rates, per-trade limits and restricted countries live here too, so they can be
 * changed from the admin console without a deploy.
 *
 * Everything in this file is pure (no database), amounts are exact integers in 1e-8 units.
 */

export const DEFAULT_PAYOUT_RATES: Readonly<Record<string, string>> = {
  'BTC/USD': '0.88',
  'ETH/USD': '0.86',
  'SOL/USD': '0.84',
  'XRP/USD': '0.82',
  'EUR/USD': '0.80',
  'GBP/USD': '0.81',
  'AAPL/USD': '0.78',
  'TSLA/USD': '0.79',
  'XAU/USD': '0.83',
  'NAS100/USD': '0.80',
}
export const FALLBACK_PAYOUT_RATE = '0.80'

/**
 * Starting point for restricted countries: the places a comparable platform (ExpertOption) lists as unserved, from a
 * third-party summary dated October 2023. It is NOT legal advice and may be incomplete. Review with a lawyer and edit it
 * in Admin > Risk limits. Restricted countries cannot open real-money trades, start KYC or make real deposits; they can
 * always withdraw.
 */
export const DEFAULT_RESTRICTED_COUNTRIES: readonly string[] = [
  'US', 'CA', 'KP', 'CH', 'IL', 'NZ', 'AU', 'PR', 'SG', 'ID', 'RU', 'IR', 'YE',
  'NL', 'DE', 'FR', 'ES', 'PT', 'GR', 'IT', 'SE', 'IS',
]

export type RiskLimits = {
  minTradeAmount: string
  maxTradeAmount: string
  maxUserOpenExposure: string
  maxUserOpenPositions: number
  maxPlatformOpenProfit: string
  maxAssetOpenProfit: string
  maxDirectionOpenProfit: string
  payoutRates: Record<string, string>
  restrictedCountries: string[]
  alertKycReviewHours: number
}

export const DEFAULT_RISK_LIMITS: Readonly<RiskLimits> = Object.freeze({
  minTradeAmount: '1.00000000',
  maxTradeAmount: '100.00000000',
  maxUserOpenExposure: '500.00000000',
  maxUserOpenPositions: 10,
  maxPlatformOpenProfit: '2000.00000000',
  maxAssetOpenProfit: '1000.00000000',
  maxDirectionOpenProfit: '600.00000000',
  payoutRates: {},
  restrictedCountries: [...DEFAULT_RESTRICTED_COUNTRIES],
  alertKycReviewHours: 24,
})

export class RiskInputError extends Error {
  readonly statusCode = 400
  readonly code = 'INVALID_RISK_SETTINGS'
  constructor(message: string) {
    super(message)
    this.name = 'RiskInputError'
  }
}

// ---------------------------------------------------------------- reading and validating settings

type Stringish = { toString(): string }

/** The shape stored in the database. Values may be Prisma Decimals, numbers or JSON, so reading is tolerant. */
export type RiskSettingsRecord = {
  minTradeAmount?: Stringish | null
  maxTradeAmount?: Stringish | null
  maxUserOpenExposure?: Stringish | null
  maxUserOpenPositions?: number | null
  maxPlatformOpenProfit?: Stringish | null
  maxAssetOpenProfit?: Stringish | null
  maxDirectionOpenProfit?: Stringish | null
  payoutRates?: unknown
  restrictedCountries?: unknown
  alertKycReviewHours?: number | null
}

function amountOr(value: Stringish | null | undefined, fallback: string): string {
  if (value === null || value === undefined) return fallback
  try {
    return fromUnits(toUnits(value.toString()))
  } catch {
    return fallback
  }
}

function intOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function ratesFrom(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result
  for (const [symbol, rate] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rate === 'string' && /^\d(\.\d{1,4})?$/.test(rate)) result[symbol] = rate
  }
  return result
}

function countriesFrom(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback]
  const codes = value.filter((item): item is string => typeof item === 'string' && /^[A-Z]{2}$/.test(item))
  return [...new Set(codes)]
}

/** Turn a stored row (or nothing) into usable limits. Missing or unreadable values fall back to the safe defaults. */
export function riskLimitsFromRecord(record: RiskSettingsRecord | null | undefined): RiskLimits {
  const d = DEFAULT_RISK_LIMITS
  if (!record) return { ...d, payoutRates: {}, restrictedCountries: [...d.restrictedCountries] }
  return {
    minTradeAmount: amountOr(record.minTradeAmount, d.minTradeAmount),
    maxTradeAmount: amountOr(record.maxTradeAmount, d.maxTradeAmount),
    maxUserOpenExposure: amountOr(record.maxUserOpenExposure, d.maxUserOpenExposure),
    maxUserOpenPositions: intOr(record.maxUserOpenPositions, d.maxUserOpenPositions),
    maxPlatformOpenProfit: amountOr(record.maxPlatformOpenProfit, d.maxPlatformOpenProfit),
    maxAssetOpenProfit: amountOr(record.maxAssetOpenProfit, d.maxAssetOpenProfit),
    maxDirectionOpenProfit: amountOr(record.maxDirectionOpenProfit, d.maxDirectionOpenProfit),
    payoutRates: ratesFrom(record.payoutRates),
    restrictedCountries: record.restrictedCountries === null || record.restrictedCountries === undefined
      ? [...d.restrictedCountries]
      : countriesFrom(record.restrictedCountries, d.restrictedCountries),
    alertKycReviewHours: intOr(record.alertKycReviewHours, d.alertKycReviewHours),
  }
}

function requireAmount(input: Record<string, unknown>, field: keyof RiskLimits, allowZero = false): string {
  const raw = input[field]
  const text = typeof raw === 'number' ? String(raw) : raw
  if (typeof text !== 'string' || !/^\d{1,16}(\.\d{1,8})?$/.test(text.trim())) {
    throw new RiskInputError(field + ' must be a positive amount with at most 8 decimals')
  }
  const units = toUnits(text.trim())
  if (units < 0n || (!allowZero && units === 0n)) throw new RiskInputError(field + ' must be greater than zero')
  return fromUnits(units)
}

function requireInt(input: Record<string, unknown>, field: keyof RiskLimits, min: number, max: number): number {
  const raw = input[field]
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RiskInputError(field + ' must be a whole number between ' + min + ' and ' + max)
  }
  return value
}

/** Validate a complete settings object from the admin console. Throws RiskInputError with a message an admin can act on. */
export function parseRiskLimitsInput(input: unknown): RiskLimits {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new RiskInputError('Settings must be an object')
  const body = input as Record<string, unknown>

  const minTradeAmount = requireAmount(body, 'minTradeAmount')
  const maxTradeAmount = requireAmount(body, 'maxTradeAmount')
  const maxUserOpenExposure = requireAmount(body, 'maxUserOpenExposure')
  const maxPlatformOpenProfit = requireAmount(body, 'maxPlatformOpenProfit')
  const maxAssetOpenProfit = requireAmount(body, 'maxAssetOpenProfit')
  const maxDirectionOpenProfit = requireAmount(body, 'maxDirectionOpenProfit')
  const maxUserOpenPositions = requireInt(body, 'maxUserOpenPositions', 1, 1000)
  const alertKycReviewHours = requireInt(body, 'alertKycReviewHours', 1, 720)

  if (toUnits(minTradeAmount) > toUnits(maxTradeAmount)) throw new RiskInputError('The minimum trade amount cannot exceed the maximum')
  if (toUnits(maxUserOpenExposure) < toUnits(maxTradeAmount)) throw new RiskInputError('Per-user open exposure must be at least the maximum trade amount')
  if (toUnits(maxDirectionOpenProfit) > toUnits(maxAssetOpenProfit)) throw new RiskInputError('The per-direction cap cannot exceed the per-asset cap')
  if (toUnits(maxAssetOpenProfit) > toUnits(maxPlatformOpenProfit)) throw new RiskInputError('The per-asset cap cannot exceed the platform cap')

  const payoutRates: Record<string, string> = {}
  const rawRates = body.payoutRates ?? {}
  if (typeof rawRates !== 'object' || rawRates === null || Array.isArray(rawRates)) throw new RiskInputError('payoutRates must be an object')
  for (const [symbol, rate] of Object.entries(rawRates as Record<string, unknown>)) {
    if (!/^[A-Z0-9]{2,12}\/[A-Z]{3}$/.test(symbol)) throw new RiskInputError('Unknown asset symbol: ' + symbol)
    const text = typeof rate === 'number' ? String(rate) : rate
    if (typeof text !== 'string' || !/^0(\.\d{1,4})?$/.test(text.trim())) throw new RiskInputError('Payout for ' + symbol + ' must be a rate such as 0.85')
    const value = Number(text)
    if (value < 0.05 || value > 0.95) throw new RiskInputError('Payout for ' + symbol + ' must be between 5% and 95%')
    payoutRates[symbol] = text.trim()
  }

  const rawCountries = body.restrictedCountries ?? []
  if (!Array.isArray(rawCountries) || rawCountries.length > 300) throw new RiskInputError('restrictedCountries must be a list of country codes')
  const restrictedCountries = rawCountries.map((code) => {
    const upper = typeof code === 'string' ? code.trim().toUpperCase() : ''
    if (!/^[A-Z]{2}$/.test(upper)) throw new RiskInputError('Invalid country code: ' + String(code))
    return upper
  })

  return {
    minTradeAmount,
    maxTradeAmount,
    maxUserOpenExposure,
    maxUserOpenPositions,
    maxPlatformOpenProfit,
    maxAssetOpenProfit,
    maxDirectionOpenProfit,
    payoutRates,
    restrictedCountries: [...new Set(restrictedCountries)],
    alertKycReviewHours,
  }
}

export function payoutRateFor(symbol: string, limits: Pick<RiskLimits, 'payoutRates'>): string {
  return limits.payoutRates[symbol] ?? DEFAULT_PAYOUT_RATES[symbol] ?? FALLBACK_PAYOUT_RATE
}

/**
 * Which fields of `next` take MORE risk than `previous`. Lowering a limit is always safe and any administrator may do it;
 * loosening one (higher caps, higher payouts, fewer restricted countries) needs a super administrator.
 */
export function looseningChanges(previous: RiskLimits, next: RiskLimits): string[] {
  const loosened: string[] = []
  const higher = (field: 'maxTradeAmount' | 'maxUserOpenExposure' | 'maxPlatformOpenProfit' | 'maxAssetOpenProfit' | 'maxDirectionOpenProfit') => {
    if (toUnits(next[field]) > toUnits(previous[field])) loosened.push(field)
  }
  higher('maxTradeAmount')
  higher('maxUserOpenExposure')
  higher('maxPlatformOpenProfit')
  higher('maxAssetOpenProfit')
  higher('maxDirectionOpenProfit')
  if (next.maxUserOpenPositions > previous.maxUserOpenPositions) loosened.push('maxUserOpenPositions')

  const symbols = new Set([...Object.keys(previous.payoutRates), ...Object.keys(next.payoutRates), ...Object.keys(DEFAULT_PAYOUT_RATES)])
  for (const symbol of symbols) {
    if (Number(payoutRateFor(symbol, next)) > Number(payoutRateFor(symbol, previous))) loosened.push('payout ' + symbol)
  }

  const stillRestricted = new Set(next.restrictedCountries)
  for (const code of previous.restrictedCountries) if (!stillRestricted.has(code)) loosened.push('country ' + code)
  return loosened
}

// ---------------------------------------------------------------- open exposure and caps

export type OpenPosition = { assetId: string; side: 'BUY' | 'SELL'; amount: string; payoutRate: string }

export type OpenRisk = {
  platformProfit: bigint
  byAsset: Map<string, bigint>
  byDirection: Map<string, bigint>
}

export const directionKey = (assetId: string, side: 'BUY' | 'SELL'): string => assetId + ':' + side

/** Profit the platform would owe on one trade if the customer wins: stake x payout rate. */
export function profitAtRisk(amount: string, payoutRate: string): bigint {
  return (toUnits(amount) * toUnits(payoutRate)) / UNIT
}

export function summarizeOpenRisk(positions: readonly OpenPosition[]): OpenRisk {
  const risk: OpenRisk = { platformProfit: 0n, byAsset: new Map(), byDirection: new Map() }
  for (const position of positions) {
    const profit = profitAtRisk(position.amount, position.payoutRate)
    risk.platformProfit += profit
    risk.byAsset.set(position.assetId, (risk.byAsset.get(position.assetId) ?? 0n) + profit)
    const key = directionKey(position.assetId, position.side)
    risk.byDirection.set(key, (risk.byDirection.get(key) ?? 0n) + profit)
  }
  return risk
}

export type RiskRejection = { cap: 'USER_EXPOSURE' | 'USER_POSITIONS' | 'PLATFORM' | 'ASSET' | 'DIRECTION'; message: string }

/**
 * Decide whether one more REAL trade fits inside every cap. Returns the first cap it would break, or null.
 * The messages are shown to customers, so they say what happened without revealing the limits themselves.
 */
export function evaluateRiskCaps(input: {
  limits: RiskLimits
  amount: string
  payoutRate: string
  side: 'BUY' | 'SELL'
  assetId: string
  open: OpenRisk
  userOpenExposure: string
  userOpenCount: number
}): RiskRejection | null {
  const { limits, open } = input
  if (input.userOpenCount >= limits.maxUserOpenPositions) {
    return { cap: 'USER_POSITIONS', message: 'You have reached the maximum number of open trades' }
  }
  if (toUnits(input.userOpenExposure) + toUnits(input.amount) > toUnits(limits.maxUserOpenExposure)) {
    return { cap: 'USER_EXPOSURE', message: 'This trade would exceed your open trade limit' }
  }

  const profit = profitAtRisk(input.amount, input.payoutRate)
  if (open.platformProfit + profit > toUnits(limits.maxPlatformOpenProfit)) {
    return { cap: 'PLATFORM', message: 'Trading capacity is temporarily full. Please try a smaller amount or try again shortly' }
  }
  if ((open.byAsset.get(input.assetId) ?? 0n) + profit > toUnits(limits.maxAssetOpenProfit)) {
    return { cap: 'ASSET', message: 'Trading capacity for this asset is temporarily full. Please try a smaller amount or try again shortly' }
  }
  if ((open.byDirection.get(directionKey(input.assetId, input.side)) ?? 0n) + profit > toUnits(limits.maxDirectionOpenProfit)) {
    return { cap: 'DIRECTION', message: 'Trading capacity for this direction is temporarily full. Please try a smaller amount or the other direction' }
  }
  return null
}

// ---------------------------------------------------------------- reserve and utilisation

export type Reserve = {
  /** Available + held customer balances: money that belongs to customers and must be payable on request. */
  customerFunds: string
  /** Profit owed on top of the held stakes if every open trade won. */
  openProfitAtRisk: string
  /** Cash the platform should hold: customer funds plus the profit it would owe if every open trade won. */
  requiredReserve: string
}

export function computeReserve(input: { availableBalances: string; heldBalances: string; openStake: string; openMaxPayout: string }): Reserve {
  const customerFunds = toUnits(input.availableBalances) + toUnits(input.heldBalances)
  const profit = toUnits(input.openMaxPayout) - toUnits(input.openStake)
  const openProfit = profit > 0n ? profit : 0n
  return {
    customerFunds: fromUnits(customerFunds),
    openProfitAtRisk: fromUnits(openProfit),
    requiredReserve: fromUnits(customerFunds + openProfit),
  }
}

export type Utilization = { used: string; limit: string; percent: number }

export function utilization(used: bigint, limit: string): Utilization {
  const cap = toUnits(limit)
  const percent = cap === 0n ? 100 : Math.min(999, Number((used * 10_000n) / cap) / 100)
  return { used: fromUnits(used), limit: fromUnits(cap), percent }
}

// ---------------------------------------------------------------- shared in-memory copy

let current: RiskLimits = riskLimitsFromRecord(null)

/** The limits currently in force in this process. Refreshed from the database at start-up, on a timer and after each change. */
export const riskLimitsStore = {
  get: (): RiskLimits => current,
  set: (limits: RiskLimits): void => { current = limits },
}

export function isCountryRestricted(countryCode: string | null | undefined, limits: Pick<RiskLimits, 'restrictedCountries'> = current): boolean {
  if (!countryCode) return false
  return limits.restrictedCountries.includes(countryCode.trim().toUpperCase())
}
