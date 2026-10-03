import {
  AreaChart,
  BarChart3,
  Check,
  ChevronDown,
  Crosshair,
  Eraser,
  Grid2X2,
  LineChart,
  Maximize2,
  Minus,
  PenLine,
  Settings2,
  Slash,
  Square,
  TrendingUp,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
} from 'lightweight-charts'
import type { MarketAsset } from '../../data/mockMarket'
import { generateMockCandles } from '../../data/mockCandles'
import type { MarketCandle } from '../../api/contracts'
import { useMarketCandles } from '../../hooks/useServerState'
import type { OpenTrade } from '../../types/trading'
import { tradeProgress, tradeRemainingSeconds } from '../../types/trading'
import { formatPercent, formatPrice } from '../../lib/format'
import { ErrorState } from '../ui/ErrorState'
import { IconButton } from '../ui/IconButton'

type ChartType = 'candles' | 'line' | 'area'
type IndicatorId = 'sma' | 'ema' | 'rsi' | 'macd' | 'bollinger' | 'stochastic' | 'atr' | 'psar' | 'alligator' | 'ao' | 'fractal'
type DrawingTool = 'none' | 'horizontal' | 'trend' | 'vertical' | 'ray' | 'fibonacci' | 'rectangle' | 'price' | 'text'
type Drawing = { id: string; type: Exclude<DrawingTool, 'none'>; x1: number; y1: number; x2: number; y2: number; text?: string; price?: number }

const indicatorDefinitions: Array<{ id: IndicatorId; label: string; description: string; group: 'overlay' | 'oscillator' }> = [
  { id: 'sma', label: 'SMA (14)', description: 'Simple moving average', group: 'overlay' },
  { id: 'ema', label: 'EMA (14)', description: 'Exponential moving average', group: 'overlay' },
  { id: 'rsi', label: 'RSI (14)', description: 'Relative strength index', group: 'oscillator' },
  { id: 'macd', label: 'MACD', description: 'Trend and momentum', group: 'oscillator' },
  { id: 'bollinger', label: 'Bollinger Bands', description: 'Volatility envelope', group: 'overlay' },
  { id: 'stochastic', label: 'Stochastic', description: 'Momentum oscillator', group: 'oscillator' },
  { id: 'atr', label: 'ATR (14)', description: 'Average true range', group: 'oscillator' },
  { id: 'psar', label: 'Parabolic SAR', description: 'Trend reversal guide', group: 'overlay' },
  { id: 'alligator', label: 'Alligator', description: 'Three smoothed trend lines', group: 'overlay' },
  { id: 'ao', label: 'Awesome Oscillator', description: 'Momentum oscillator', group: 'oscillator' },
  { id: 'fractal', label: 'Fractals', description: 'Swing high and low markers', group: 'overlay' },
]
const defaultIndicators: IndicatorId[] = ['sma']
const indicatorStorageKey = 'slspot.chart.indicators'
const indicatorPeriodStorageKey = 'slspot.chart.indicator-period'
const drawingStoragePrefix = 'slspot.chart.drawings:'
type ChartCandle = {
  time: import('lightweight-charts').UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
}

type ChartWorkspaceProps = {
  asset: MarketAsset
  onOpenMarkets: () => void
  openTrades: OpenTrade[]
  now: number
}

const timeframes = ['1m', '5m', '15m', '30m', '1H', '4H', '1D']

function calculateSma(candles: ChartCandle[], period = 14) {
  return candles.map((candle, index) => {
    const start = Math.max(0, index - period + 1)
    const slice = candles.slice(start, index + 1)
    const value = slice.reduce((sum, item) => sum + item.close, 0) / slice.length
    return { time: candle.time, value }
  })
}

function calculateRsi(candles: ChartCandle[], period = 14) {
  const points = candles.map((candle, index) => {
    if (index === 0) return 50
    const previous = candles[index - 1]
    if (!previous) return 50
    const change = candle.close - previous.close
    const start = Math.max(1, index - period + 1)
    let gain = 0
    let loss = 0
    for (let cursor = start; cursor <= index; cursor += 1) {
      const current = candles[cursor]
      const previous = candles[cursor - 1]
      if (!current || !previous) continue
      const delta = current.close - previous.close
      if (delta >= 0) gain += delta
      else loss += Math.abs(delta)
    }
    const count = index - start + 1
    gain /= Math.max(1, count)
    loss /= Math.max(1, count)
    if (loss === 0) return change > 0 ? 100 : 50
    const rs = gain / loss
    return 100 - 100 / (1 + rs)
  })
  return points
}


type OverlayPoint = { time: ChartCandle['time']; value: number }

function calculateEma(candles: ChartCandle[], period = 14): OverlayPoint[] {
  const multiplier = 2 / (period + 1)
  let previous = candles[0]?.close ?? 0
  return candles.map((candle, index) => {
    previous = index === 0 ? candle.close : (candle.close - previous) * multiplier + previous
    return { time: candle.time, value: previous }
  })
}

function calculateBollinger(candles: ChartCandle[], period = 20): { upper: OverlayPoint[]; middle: OverlayPoint[]; lower: OverlayPoint[] } {
  const middle: OverlayPoint[] = []
  const upper: OverlayPoint[] = []
  const lower: OverlayPoint[] = []
  for (let index = 0; index < candles.length; index += 1) {
    const start = Math.max(0, index - period + 1)
    const slice = candles.slice(start, index + 1)
    const mean = slice.reduce((sum, item) => sum + item.close, 0) / slice.length
    const variance = slice.reduce((sum, item) => sum + Math.pow(item.close - mean, 2), 0) / slice.length
    const deviation = Math.sqrt(variance)
    middle.push({ time: candles[index]!.time, value: mean })
    upper.push({ time: candles[index]!.time, value: mean + deviation * 2 })
    lower.push({ time: candles[index]!.time, value: mean - deviation * 2 })
  }
  return { middle, upper, lower }
}

function calculateStochastic(candles: ChartCandle[], period = 14): number[] {
  return candles.map((candle, index) => {
    const slice = candles.slice(Math.max(0, index - period + 1), index + 1)
    const highest = Math.max(...slice.map((item) => item.high))
    const lowest = Math.min(...slice.map((item) => item.low))
    return highest === lowest ? 50 : ((candle.close - lowest) / (highest - lowest)) * 100
  })
}

function calculateAtr(candles: ChartCandle[], period = 14): number[] {
  const ranges = candles.map((candle, index) => {
    const previous = candles[index - 1]?.close ?? candle.close
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous), Math.abs(candle.low - previous))
  })
  return ranges.map((_, index) => {
    const slice = ranges.slice(Math.max(0, index - period + 1), index + 1)
    return slice.reduce((sum, value) => sum + value, 0) / slice.length
  })
}

function calculateMacd(candles: ChartCandle[], fast = 12, slow = 26, signalPeriod = 9): { macd: number[]; signal: number[] } {
  const fastEma = calculateEma(candles, fast)
  const slowEma = calculateEma(candles, slow)
  const macd = candles.map((_, index) => (fastEma[index]?.value ?? 0) - (slowEma[index]?.value ?? 0))
  let previousSignal = macd[0] ?? 0
  const multiplier = 2 / (signalPeriod + 1)
  const signal = macd.map((value, index) => {
    previousSignal = index === 0 ? value : (value - previousSignal) * multiplier + previousSignal
    return previousSignal
  })
  return { macd, signal }
}

function calculateAwesomeOscillator(candles: ChartCandle[]): number[] {
  const median = candles.map((candle) => (candle.high + candle.low) / 2)
  const short = median.map((value, index) => {
    const slice = median.slice(Math.max(0, index - 4), index + 1)
    return slice.reduce((sum, item) => sum + item, 0) / slice.length
  })
  const long = median.map((value, index) => {
    const slice = median.slice(Math.max(0, index - 33), index + 1)
    return slice.reduce((sum, item) => sum + item, 0) / slice.length
  })
  return short.map((value, index) => value - (long[index] ?? 0))
}

function calculatePsar(candles: ChartCandle[]): OverlayPoint[] {
  if (!candles.length) return []
  let rising = true
  let sar = candles[0]!.low
  let extreme = candles[0]!.high
  let acceleration = 0.02
  return candles.map((candle, index) => {
    if (index === 0) return { time: candle.time, value: sar }
    const previous = candles[index - 1]!
    sar += acceleration * (extreme - sar)
    if (rising) {
      sar = Math.min(sar, previous.low, candle.low)
      if (candle.low < sar) {
        rising = false
        sar = extreme
        extreme = candle.low
        acceleration = 0.02
      } else if (candle.high > extreme) {
        extreme = candle.high
        acceleration = Math.min(0.2, acceleration + 0.02)
      }
    } else {
      sar = Math.max(sar, previous.high, candle.high)
      if (candle.high > sar) {
        rising = true
        sar = extreme
        extreme = candle.high
        acceleration = 0.02
      } else if (candle.low < extreme) {
        extreme = candle.low
        acceleration = Math.min(0.2, acceleration + 0.02)
      }
    }
    return { time: candle.time, value: sar }
  })
}

function calculateAlligator(candles: ChartCandle[]): { jaw: OverlayPoint[]; teeth: OverlayPoint[]; lips: OverlayPoint[] } {
  const median = candles.map((candle) => (candle.high + candle.low) / 2)
  const make = (period: number) => median.map((value, index) => {
    const slice = median.slice(Math.max(0, index - period + 1), index + 1)
    return { time: candles[index]!.time, value: slice.reduce((sum, item) => sum + item, 0) / slice.length }
  })
  return { jaw: make(13), teeth: make(8), lips: make(5) }
}

function calculateFractals(candles: ChartCandle[]): { highs: OverlayPoint[]; lows: OverlayPoint[] } {
  const highs: OverlayPoint[] = []
  const lows: OverlayPoint[] = []
  for (let index = 2; index < candles.length - 2; index += 1) {
    const current = candles[index]!
    const window = candles.slice(index - 2, index + 3)
    if (current.high >= Math.max(...window.map((item) => item.high))) highs.push({ time: current.time, value: current.high })
    if (current.low <= Math.min(...window.map((item) => item.low))) lows.push({ time: current.time, value: current.low })
  }
  return { highs, lows }
}

function normalizeOscillator(values: number[]): number[] {
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, Number.EPSILON)
  return values.map((value) => 10 + ((value - min) / range) * 80)
}

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds)
  if (safe < 60) return safe + 's'
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return minutes + ':' + remainder.toString().padStart(2, '0')
}

function ChartCanvas({
  asset,
  datasetKey,
  chartType,
  crosshairEnabled,
  gridEnabled,
  priceLineEnabled,
  maEnabled,
  candles,
  usingMockCandles,
}: {
  asset: MarketAsset
  datasetKey: string
  chartType: ChartType
  crosshairEnabled: boolean
  gridEnabled: boolean
  priceLineEnabled: boolean
  maEnabled: boolean
  candles: ChartCandle[]
  usingMockCandles: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const primarySeriesRef = useRef<unknown>(null)
  const maSeriesRef = useRef<unknown>(null)
  const priceLineRef = useRef<{ applyOptions: (options: { price: number }) => void } | null>(null)
  const fittedDatasetRef = useRef<string | null>(null)
  const closes = useMemo(
    () => candles.map((candle) => ({ time: candle.time, value: candle.close })),
    [candles],
  )
  const sma = useMemo(() => calculateSma(candles), [candles])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      width: container.clientWidth,
      height: Math.max(container.clientHeight, 240),
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9a9aa4',
        attributionLogo: false,
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,.08)',
        scaleMargins: { top: 0.08, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    })

    let series: unknown

    if (chartType === 'candles') {
      series = chart.addSeries(CandlestickSeries, {
        upColor: '#1fd27a',
        downColor: '#ff4d5e',
        borderVisible: false,
        wickUpColor: '#1fd27a',
        wickDownColor: '#ff4d5e',
      })
    } else if (chartType === 'area') {
      series = chart.addSeries(AreaSeries, {
        topColor: 'rgba(255,194,26,.22)',
        bottomColor: 'rgba(255,194,26,.01)',
        lineColor: '#ffc21a',
        lineWidth: 2,
      })
    } else {
      series = chart.addSeries(LineSeries, { color: '#ffc21a', lineWidth: 2 })
    }

    primarySeriesRef.current = series
    chartRef.current = chart
    fittedDatasetRef.current = null

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      chart.applyOptions({
        width: Math.floor(rect.width),
        height: Math.max(Math.floor(rect.height), 240),
      })
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      if (chartRef.current === chart) chartRef.current = null
      primarySeriesRef.current = null
      maSeriesRef.current = null
      priceLineRef.current = null
      chart.remove()
    }
  }, [asset.symbol, chartType])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    chart.applyOptions({
      grid: {
        vertLines: { color: gridEnabled ? 'rgba(255,255,255,.045)' : 'transparent' },
        horzLines: { color: gridEnabled ? 'rgba(255,255,255,.045)' : 'transparent' },
      },
      crosshair: {
        mode: crosshairEnabled ? CrosshairMode.Normal : CrosshairMode.Hidden,
        vertLine: {
          color: 'rgba(255,194,26,.28)',
          width: 1,
          labelVisible: crosshairEnabled,
        },
        horzLine: {
          color: 'rgba(255,194,26,.18)',
          width: 1,
          labelVisible: crosshairEnabled,
        },
      },
    })
  }, [crosshairEnabled, gridEnabled])

  useEffect(() => {
    const series = primarySeriesRef.current as {
      setData: (data: unknown[]) => void
    } | null

    if (!series) return

    if (chartType === 'candles') {
      if (candles.length) series.setData(candles)
    } else {
      if (closes.length) series.setData(closes)
    }

    if (candles.length && fittedDatasetRef.current !== datasetKey) {
      chartRef.current?.timeScale().fitContent()
      fittedDatasetRef.current = datasetKey
    }
  }, [candles, chartType, closes, datasetKey])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const currentMa = maSeriesRef.current as {
      setData: (data: unknown[]) => void
      update: (data: unknown) => void
    } | null

    if (!maEnabled) {
      if (currentMa) {
        chart.removeSeries(currentMa as never)
        maSeriesRef.current = null
      }
      return
    }

    if (!currentMa) {
      const nextMa = chart.addSeries(LineSeries, {
        color: '#ffc21a',
        lineWidth: 2,
        lastValueVisible: false,
        priceLineVisible: false,
      })
      maSeriesRef.current = nextMa
    }

    const maSeries = maSeriesRef.current as {
      setData: (data: unknown[]) => void
    }
    maSeries.setData(sma)
  }, [chartType, maEnabled, sma])

  useEffect(() => {
    const chart = chartRef.current
    const series = primarySeriesRef.current as {
      createPriceLine: (options: unknown) => { applyOptions: (options: { price: number }) => void }
      removePriceLine: (line: { applyOptions: (options: { price: number }) => void }) => void
    } | null

    if (!chart || !series) return

    if (!priceLineEnabled) {
      if (priceLineRef.current) {
        series.removePriceLine(priceLineRef.current)
        priceLineRef.current = null
      }
      return
    }

    if (!priceLineRef.current) {
      priceLineRef.current = series.createPriceLine({
        price: asset.price,
        color: '#ffc21a',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'Last',
      })
      return
    }

    priceLineRef.current.applyOptions({ price: asset.price })
  }, [asset.price, chartType, priceLineEnabled])

  useEffect(() => {
    const price = asset.price
    if (!Number.isFinite(price) || price <= 0 || candles.length === 0) return

    const last = candles[candles.length - 1]
    if (!last) return

    const nextCandle = {
      ...last,
      close: price,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
    }

    const primary = primarySeriesRef.current as {
      update: (data: unknown) => void
    } | null

    if (primary) {
      if (chartType === 'candles') {
        primary.update(nextCandle)
      } else {
        primary.update({ time: last.time, value: price })
      }
    }

    const maSeries = maSeriesRef.current as {
      update: (data: unknown) => void
    } | null

    if (maSeries && maEnabled) {
      const nextSma = calculateSma(
        [...candles.slice(0, -1), nextCandle],
      ).at(-1)
      if (nextSma) maSeries.update(nextSma)
    }
  }, [asset.price, candles, chartType, maEnabled])

  return (
    <div className="chart-canvas-shell">
      <div
        ref={containerRef}
        className="chart-canvas"
        role="img"
        aria-label={asset.symbol + ' ' + chartType + ' market chart'}
      />
      <div className="chart-attribution">{usingMockCandles ? 'Demo fallback' : 'Server OHLC'}</div>
    </div>
  )
}

function timeframeToApiInterval(timeframe: string): string {
  switch (timeframe) {
    case '1m': return '1min'
    case '5m': return '5min'
    case '15m': return '15min'
    case '30m': return '30min'
    case '1H': return '1h'
    case '4H': return '4h'
    case '1D': return '1day'
    default: return '5min'
  }
}

function toChartCandles(candles: MarketCandle[]) {
  return candles.map((candle) => ({
    time: Math.floor(new Date(candle.openTime).getTime() / 1000) as import('lightweight-charts').UTCTimestamp,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  }))
}

export function ChartWorkspace({ asset, onOpenMarkets, openTrades, now }: ChartWorkspaceProps) {
  const [timeframe, setTimeframe] = useState('5m')
  const [crosshairEnabled, setCrosshairEnabled] = useState(true)
  const [gridEnabled, setGridEnabled] = useState(true)
  const [priceLineEnabled, setPriceLineEnabled] = useState(true)
  const [maEnabled, setMaEnabled] = useState(true)
  const [rsiEnabled, setRsiEnabled] = useState(false)
  const [chartType, setChartType] = useState<ChartType>('candles')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const [drawings, setDrawings] = useState<Array<{ type: DrawingTool; x1: number; y1: number; x2: number; y2: number }>>([])
  const [activeDrawing, setActiveDrawing] = useState<{ type: DrawingTool; x1: number; y1: number; x2: number; y2: number } | null>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const price = formatPrice(asset.price, asset.price < 10 ? 5 : 2)
  const marketInterval = timeframeToApiInterval(timeframe)
  const candleResource = useMarketCandles(asset.assetId, marketInterval, 200)
  const usingMockCandles = import.meta.env.DEV && (
    Boolean(candleResource.error) ||
    (candleResource.data !== null && candleResource.data.candles.length === 0)
  )
  const mockCandles = useMemo(
    () => generateMockCandles(asset, timeframe).map((candle) => ({
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    })),
    [asset.symbol, timeframe],
  )
  const candles = useMemo<ChartCandle[]>(() => {
    if (candleResource.data?.candles.length) {
      return toChartCandles(candleResource.data.candles)
    }

    return usingMockCandles ? mockCandles : []
  }, [candleResource.data, mockCandles, usingMockCandles])
  const rsi = useMemo(() => calculateRsi(candles), [candles])

  useEffect(() => {
    if (!optionsOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) setOptionsOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOptionsOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [optionsOpen])

  const handleFullscreen = async () => {
    if (!workspaceRef.current) return
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await workspaceRef.current.requestFullscreen()
  }

  const toPercentPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 50, y: 50 }
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    }
  }

  const handleDrawingStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawingTool === 'none') return
    const point = toPercentPoint(event)
    const next = { type: drawingTool, x1: point.x, y1: point.y, x2: point.x, y2: point.y }
    setActiveDrawing(next)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleDrawingMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeDrawing) return
    const point = toPercentPoint(event)
    setActiveDrawing((current) => current ? { ...current, x2: point.x, y2: point.y } : current)
  }

  const handleDrawingEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeDrawing) return
    const point = toPercentPoint(event)
    const completed = { ...activeDrawing, x2: point.x, y2: point.y }
    setDrawings((current) => [...current, completed])
    setActiveDrawing(null)
    if (drawingTool === 'horizontal') setDrawingTool('none')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const indicatorData = rsi.slice(-50)
  const rsiPolyline = indicatorData.map((value, index) => {
    const x = indicatorData.length === 1 ? 50 : (index / (indicatorData.length - 1)) * 100
    return x.toFixed(2) + ',' + (100 - value).toFixed(2)
  }).join(' ')

  return (
    <section ref={workspaceRef} className="chart-workspace panel">
      <div className="simple-chart-toolbar">
        <button className="market-trigger" type="button" onClick={onOpenMarkets} aria-label="Choose market" title="Choose market">
          <span className={'asset-icon asset-icon--' + asset.accent} aria-hidden="true">{asset.symbol.slice(0, 1)}</span>
          <span className="market-trigger__copy"><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
          <span className="market-trigger__price"><strong>{price}</strong><small className={asset.change >= 0 ? 'text-positive' : 'text-negative'}>{formatPercent(asset.change)} 24h</small></span>
          <ChevronDown size={14} />
        </button>

        <div className="chart-timeframes" aria-label="Chart timeframe">
          {timeframes.map((value) => (
            <button className={timeframe === value ? 'timeframe timeframe--active' : 'timeframe'} key={value} onClick={() => setTimeframe(value)} type="button" aria-pressed={timeframe === value}>{value}</button>
          ))}
        </div>

        <div className="chart-tools" aria-label="Chart controls">
          <IconButton label={crosshairEnabled ? 'Disable crosshair' : 'Enable crosshair'} active={crosshairEnabled} onClick={() => setCrosshairEnabled((value) => !value)}><Crosshair size={16} /></IconButton>
          <div className="chart-options" ref={optionsRef}>
            <IconButton label="Chart options" active={optionsOpen} onClick={() => setOptionsOpen((value) => !value)} aria-expanded={optionsOpen} aria-haspopup="dialog"><Settings2 size={16} /></IconButton>
            {optionsOpen ? (
              <div className="chart-options__popover" role="dialog" aria-label="Chart options">
                <div className="chart-options__header">
                  <div><span>Chart options</span><small>Keep the chart focused</small></div>
                  <Settings2 size={15} />
                </div>
                <div className="chart-option-group">
                  <span className="chart-option-group__label">Chart type</span>
                  <div className="chart-type-switch">
                    {([
                      ['candles', 'Candles', TrendingUp],
                      ['line', 'Line', LineChart],
                      ['area', 'Area', AreaChart],
                    ] as const).map(([value, label, Icon]) => (
                      <button key={value} type="button" className={chartType === value ? 'chart-type chart-type--active' : 'chart-type'} onClick={() => setChartType(value)}>
                        <Icon size={14} /><span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button className="chart-option" type="button" onClick={() => setMaEnabled((value) => !value)}>
                  <span><TrendingUp size={14} /><span><strong>MA (14)</strong><small>Moving average overlay</small></span></span>
                  <span className={maEnabled ? 'chart-option__check chart-option__check--active' : 'chart-option__check'}>{maEnabled && <Check size={12} />}</span>
                </button>

                <button className="chart-option" type="button" onClick={() => setRsiEnabled((value) => !value)}>
                  <span><LineChart size={14} /><span><strong>RSI (14)</strong><small>Momentum panel below the chart</small></span></span>
                  <span className={rsiEnabled ? 'chart-option__check chart-option__check--active' : 'chart-option__check'}>{rsiEnabled && <Check size={12} />}</span>
                </button>

                <button className="chart-option" type="button" onClick={() => setGridEnabled((value) => !value)}>
                  <span><Grid2X2 size={14} /><span><strong>Grid</strong><small>Show guide lines</small></span></span>
                  <span className={gridEnabled ? 'chart-option__check chart-option__check--active' : 'chart-option__check'}>{gridEnabled && <Check size={12} />}</span>
                </button>

                <button className="chart-option" type="button" onClick={() => setPriceLineEnabled((value) => !value)}>
                  <span><span className="chart-option__line-icon" /><span><strong>Last price</strong><small>Show the current-price marker</small></span></span>
                  <span className={priceLineEnabled ? 'chart-option__check chart-option__check--active' : 'chart-option__check'}>{priceLineEnabled && <Check size={12} />}</span>
                </button>

                <div className="chart-option-group">
                  <span className="chart-option-group__label">Drawing tools</span>
                  <div className="drawing-tools">
                    <button type="button" className={drawingTool === 'horizontal' ? 'drawing-tool drawing-tool--active' : 'drawing-tool'} onClick={() => { setDrawingTool('horizontal'); setOptionsOpen(false) }}><Minus size={14} /> Horizontal</button>
                    <button type="button" className={drawingTool === 'trend' ? 'drawing-tool drawing-tool--active' : 'drawing-tool'} onClick={() => { setDrawingTool('trend'); setOptionsOpen(false) }}><Slash size={14} /> Trend line</button>
                    <button type="button" className="drawing-tool" onClick={() => setDrawings([])}><Eraser size={14} /> Clear</button>
                  </div>
                </div>

                <div className="chart-options__footer">
                  <button type="button" className="quiet-button" onClick={() => { setCrosshairEnabled(true); setGridEnabled(true); setPriceLineEnabled(true); setMaEnabled(true); setRsiEnabled(false); setChartType('candles'); setDrawingTool('none') }}>Reset chart</button>
                </div>
              </div>
            ) : null}
          </div>
          <IconButton label="Fullscreen chart" onClick={handleFullscreen}><Maximize2 size={16} /></IconButton>
        </div>
      </div>

      <div className={rsiEnabled ? 'chart-stage chart-stage--rsi' : 'chart-stage'} ref={stageRef}>
        {candleResource.loading ? (
          <div className="chart-data-state">
            <span className="loading-spinner" aria-hidden="true" />
            <span>Loading market candles…</span>
          </div>
        ) : candleResource.error && !usingMockCandles ? (
          <div className="chart-data-state">
            <ErrorState
              title="Market data unavailable"
              message={candleResource.error.message}
              action={<button type="button" className="btn btn--ghost" onClick={() => void candleResource.reload()}>Retry</button>}
            />
          </div>
        ) : !candles.length ? (
          <div className="chart-data-state">
            <ErrorState
              title="No chart data"
              message="The market provider returned no candle data for this interval."
              action={<button type="button" className="btn btn--ghost" onClick={() => void candleResource.reload()}>Retry</button>}
            />
          </div>
        ) : (
          <ChartCanvas
            asset={asset}
            datasetKey={asset.symbol + ':' + marketInterval}
            chartType={chartType}
            crosshairEnabled={crosshairEnabled}
            gridEnabled={gridEnabled}
            priceLineEnabled={priceLineEnabled}
            maEnabled={maEnabled}
            candles={candles}
            usingMockCandles={usingMockCandles}
          />
        )}

        {candles.length ? <div className="trade-chart-markers" aria-hidden="true">
          {openTrades.map((trade) => {
            const remaining = tradeRemainingSeconds(trade, now)
            const progress = tradeProgress(trade, now)
            const priceDelta = asset.price > 0 ? (trade.entryPrice - asset.price) / (asset.price * 0.004) : 0
            const y = Math.max(10, Math.min(88, 50 + priceDelta * 30))
            const directionClass = trade.direction === 'UP' ? 'trade-chart-marker--up' : 'trade-chart-marker--down'
            return (
              <div key={trade.id} className={'trade-chart-marker ' + directionClass} style={{ top: y + '%' }}>
                <span className="trade-chart-marker__line" />
                <span className="trade-chart-marker__label"><b>{trade.direction}</b><small>{formatPrice(trade.entryPrice, trade.entryPrice < 10 ? 5 : 2)}</small><em>{formatCountdown(remaining)}</em></span>
                <span className="trade-chart-marker__progress" style={{ width: (progress * 100) + '%' }} />
              </div>
            )
          })}
        </div> : null}

        {drawingTool !== 'none' && candles.length ? (
          <div className="drawing-layer" onPointerDown={handleDrawingStart} onPointerMove={handleDrawingMove} onPointerUp={handleDrawingEnd} onPointerCancel={handleDrawingEnd} role="application" aria-label="Drawing canvas">
            <div className="drawing-layer__hint">{drawingTool === 'horizontal' ? 'Click to place a level' : 'Drag to draw a trend line'} · Esc to cancel</div>
          </div>
        ) : null}

        <svg className="drawing-layer-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {[...drawings, ...(activeDrawing ? [activeDrawing] : [])].map((drawing, index) => (
            drawing.type === 'horizontal'
              ? <line key={index} x1="0" x2="100" y1={drawing.y1} y2={drawing.y1} pathLength="100" />
              : <line key={index} x1={drawing.x1} y1={drawing.y1} x2={drawing.x2} y2={drawing.y2} pathLength="100" />
          ))}
        </svg>

        {priceLineEnabled && candles.length ? <div className="chart-price-tag"><span>{price}</span><small>{formatPercent(asset.change)}</small></div> : null}

        {rsiEnabled && candles.length ? (
          <div className="chart-rsi-panel">
            <div className="chart-rsi-panel__label"><span>RSI 14</span><strong>{Math.round(rsi[rsi.length - 1] ?? 50)}</strong></div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="RSI indicator">
              <line x1="0" x2="100" y1="30" y2="30" />
              <line x1="0" x2="100" y1="70" y2="70" />
              <polyline points={rsiPolyline} />
            </svg>
          </div>
        ) : null}
      </div>

      <div className="chart-bottom-status">
        <span><i className="live-dot" /> {candleResource.error && !usingMockCandles ? 'Market data unavailable' : candleResource.data?.candles.length ? 'Live market data' : usingMockCandles ? 'Demo market data' : 'Waiting for market data'}</span>
        <span>{timeframe}</span>
        <span>{chartType === 'candles' ? 'Candles' : chartType === 'line' ? 'Line' : 'Area'}</span>
        <span className="chart-bottom-status__spacer" />
        <span className="chart-help-text">Scroll to zoom · drag to pan</span>
      </div>
    </section>
  )
}
