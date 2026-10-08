import { intervalMs } from './intervals.js'
import type { CandleInterval } from './types.js'

/** Intervals the trading chart offers; all are aligned to the UTC epoch on Binance. */
export const LIVE_CANDLE_INTERVALS: readonly CandleInterval[] = ['1min', '5min', '15min', '30min', '1h', '4h', '1day']

export type ClosedBucket = { interval: CandleInterval; openTimeMs: number }

/**
 * Detects candle boundaries from the live tick clock. When a tick falls in a later bucket than the
 * previous tick of the same asset, the previous bucket has closed. Late/out-of-order ticks never move
 * the bucket backwards. The tracker produces only the boundary; the final OHLCV comes from the
 * exchange so published candles match the historical klines exactly.
 */
export class CandleCloseTracker {
  private readonly lastBucket = new Map<string, number>()

  constructor(private readonly intervals: readonly CandleInterval[] = LIVE_CANDLE_INTERVALS) {}

  observe(assetId: string, atMs: number): ClosedBucket[] {
    const closed: ClosedBucket[] = []
    for (const interval of this.intervals) {
      const size = intervalMs(interval)
      const bucket = Math.floor(atMs / size) * size
      const key = assetId + ':' + interval
      const previous = this.lastBucket.get(key)
      if (previous === undefined || bucket > previous) {
        this.lastBucket.set(key, bucket)
        // The very first tick after startup only establishes the current bucket.
        if (previous !== undefined) closed.push({ interval, openTimeMs: previous })
      }
    }
    return closed
  }

  clear(): void {
    this.lastBucket.clear()
  }
}
