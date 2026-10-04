import { randomBytes } from 'node:crypto'

/**
 * Fallback price source for DEMO trading when the live market feed is stale or missing.
 *
 * The previous implementation was a pure function of the wall clock
 * (`sin(Date.now() / 5000 + hash) * 0.3%`), so anyone who worked out the formula
 * could predict the price at any future expiry and win every demo trade.
 *
 * This is a random walk driven by a cryptographically secure random source. Past
 * prices carry no information about the next move beyond the current price, so
 * direction cannot be predicted. The walk is kept near the anchor price.
 *
 * State is per process. With several backend instances each one walks
 * independently; run the real market feed (or pin demo trading to one instance)
 * when entry and settlement must come from the same simulated series.
 */
export type RandomSource = () => number

/** Uniform float in [0, 1) from 53 random bits. */
export const secureRandom: RandomSource = () => {
  const bytes = randomBytes(7)
  const high = (bytes[0]! & 0x1f) * 2 ** 32
  const low = bytes.readUInt32BE(1)
  return (high + low) / 2 ** 53
}

type SymbolState = { anchor: number; price: number; at: number }

export type DemoPriceOptions = {
  random?: RandomSource
  now?: () => number
  /** Volatility per square-root second, e.g. 0.0004 = 0.04% per sqrt(s). */
  sigmaPerSqrtSecond?: number
  /** Maximum distance from the anchor, as a fraction. */
  maxDeviation?: number
}

export class DemoPriceSimulator {
  private readonly states = new Map<string, SymbolState>()
  private readonly random: RandomSource
  private readonly now: () => number
  private readonly sigma: number
  private readonly maxDeviation: number

  constructor(options: DemoPriceOptions = {}) {
    this.random = options.random ?? secureRandom
    this.now = options.now ?? Date.now
    this.sigma = options.sigmaPerSqrtSecond ?? 0.0004
    this.maxDeviation = options.maxDeviation ?? 0.05
  }

  /** Current simulated price for `symbol`, walking from `anchor` (last known or base price). */
  quote(symbol: string, anchor: number): number {
    if (!Number.isFinite(anchor) || anchor <= 0) {
      throw new RangeError('Demo price anchor must be a positive number')
    }

    const now = this.now()
    const state = this.states.get(symbol)

    if (!state || state.anchor !== anchor) {
      this.states.set(symbol, { anchor, price: anchor, at: now })
      return anchor
    }

    const elapsedSeconds = Math.min((now - state.at) / 1000, 60)
    // Repeated reads within the same instant return the same price, so an entry
    // price and a balance check made together are consistent.
    if (elapsedSeconds < 0.25) return state.price

    const shock = this.sigma * Math.sqrt(elapsedSeconds) * this.gaussian()
    const reversion = 0.002 * elapsedSeconds * ((anchor - state.price) / anchor)
    const next = state.price * (1 + shock + reversion)
    const lower = anchor * (1 - this.maxDeviation)
    const upper = anchor * (1 + this.maxDeviation)

    state.price = Math.min(upper, Math.max(lower, next))
    state.at = now
    return state.price
  }

  /** Standard normal sample (Box-Muller). */
  private gaussian(): number {
    let u = 0
    while (u === 0) u = this.random()
    const v = this.random()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
}
