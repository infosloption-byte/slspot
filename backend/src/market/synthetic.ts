import { intervalMs } from './intervals.js'
import type { CandleInterval, ProviderCandle } from './types.js'

/**
 * Development-only history used when no provider can deliver candles. The series is a
 * deterministic random walk that ends exactly at `endPrice`, so live ticks continue it
 * seamlessly instead of jumping to an unrelated price level.
 */
export function syntheticCandles(
  interval: CandleInterval,
  limit: number,
  endPrice: number,
  now = Date.now(),
  seedKey = '',
): ProviderCandle[] {
  const step = intervalMs(interval)
  const lastOpen = Math.floor(now / step) * step
  let seed = 2166136261
  for (const char of seedKey + interval) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }

  const volatility = 0.0012
  // Walk backwards from the live price so the final close equals it.
  const closes: number[] = [endPrice]
  for (let index = 1; index < limit; index += 1) {
    closes.unshift(closes[0]! / (1 + (random() - 0.5) * 2 * volatility))
  }

  const digits = endPrice < 10 ? 6 : 2
  return closes.map((close, index) => {
    const open = index === 0 ? close : closes[index - 1]!
    const high = Math.max(open, close) * (1 + random() * volatility * 0.5)
    const low = Math.min(open, close) * (1 - random() * volatility * 0.5)
    const openTime = lastOpen - (limit - 1 - index) * step
    return {
      interval,
      openTime: new Date(openTime).toISOString(),
      closeTime: new Date(openTime + step).toISOString(),
      open: open.toFixed(digits),
      high: high.toFixed(digits),
      low: low.toFixed(digits),
      close: close.toFixed(digits),
      volume: String(Math.round(50 + random() * 200)),
    }
  })
}
