export type LiveBar = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

/**
 * Fold a live price into the current candle, or start the next one.
 *
 * - Within the candle's period the price extends high/low and becomes the close.
 *   The caller passes back the bar this function returned last time, so the high and
 *   low accumulate across ticks instead of resetting to the server candle every time.
 * - Once a full interval has passed since the candle opened, a new candle starts at
 *   `last.time + n * interval`. Aligning to the last server candle (not to the epoch)
 *   keeps the new bar on the same grid the provider uses for its own candles.
 *
 * Pure so it can be tested without a chart.
 */
export function applyLivePrice<T extends LiveBar>(last: T, price: number, intervalSeconds: number, nowSeconds: number): T {
  const periodsElapsed = Math.floor((nowSeconds - last.time) / intervalSeconds)

  if (periodsElapsed >= 1) {
    return {
      ...last,
      time: last.time + periodsElapsed * intervalSeconds,
      open: last.close,
      high: Math.max(last.close, price),
      low: Math.min(last.close, price),
      close: price,
      ...(last.volume !== undefined ? { volume: 0 } : {}),
    }
  }

  return {
    ...last,
    high: Math.max(last.high, price),
    low: Math.min(last.low, price),
    close: price,
  }
}

/**
 * Decide which bar live ticks should keep extending after the server candles changed.
 *
 * A candle event or reload replaces the server candles, which do not contain the candle this
 * client started locally at a period rollover. If the local bar is newer than the server's last
 * bar it is kept, so its accumulated high/low are not thrown away and a late event for the old
 * period cannot pull new-period prices back into the old candle. Once the server delivers the
 * new period's candle, the server bar wins.
 */
export function reconcileLiveBar<T extends LiveBar>(live: T | null, serverLast: T | null): T | null {
  if (!serverLast) return null
  if (live && live.time > serverLast.time) return live
  return serverLast
}
