import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'
import type { MarketAsset } from './mockMarket'

const timeframeSeconds: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
}

function symbolSeed(symbol: string): number {
  return symbol.split('').reduce((total, char) => total + char.charCodeAt(0), 0)
}

export function generateMockCandles(asset: MarketAsset, timeframe: string): CandlestickData<UTCTimestamp>[] {
  const step = timeframeSeconds[timeframe] ?? 300
  const seed = symbolSeed(asset.symbol)
  const now = Math.floor(Date.now() / 1000)
  const end = Math.floor(now / step) * step
  const volatility = Math.max(asset.price * 0.0024, 0.00008)
  const candles: CandlestickData<UTCTimestamp>[] = []

  let close = asset.price * (1 - ((seed % 17) - 8) * 0.00035)

  for (let index = 0; index < 96; index += 1) {
    const wave = Math.sin((index + seed) * 0.68) * volatility * 0.42
    const drift = Math.cos((index + seed) * 0.19) * volatility * 0.16
    const open = close
    const nextClose = Math.max(0.0000001, close + wave + drift)
    const high = Math.max(open, nextClose) + volatility * (0.35 + ((index + seed) % 4) * 0.08)
    const low = Math.min(open, nextClose) - volatility * (0.32 + ((index + seed) % 3) * 0.09)

    candles.push({
      time: (end - (95 - index) * step) as UTCTimestamp,
      open,
      high,
      low: Math.max(0.0000001, low),
      close: nextClose,
    })

    close = nextClose
  }

  // Anchor the series so the last close matches the asset's quoted price
  const last = candles[candles.length - 1]
  if (last) {
    const offset = asset.price - last.close
    for (const candle of candles) {
      candle.open += offset
      candle.high += offset
      candle.low = Math.max(0.0000001, candle.low + offset)
      candle.close += offset
    }
  }

  return candles
}
