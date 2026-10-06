import {
  ChevronDown,
  Clock3,
  Crosshair,
  Maximize2,
  Settings2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRealtime } from '../../realtime/useRealtime'
import { useMediaQuery } from '../../hooks/useMediaQuery'
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
  type UTCTimestamp,
} from 'lightweight-charts'
import type { MarketAsset } from '../../data/mockMarket'
import { generateMockCandles } from '../../data/mockCandles'
import type { MarketCandle } from '../../api/contracts'
import { useMarketCandles } from '../../hooks/useServerState'
import type { OpenTrade } from '../../types/trading'
import { tradeRemainingSeconds } from '../../types/trading'
import type { RealtimeConnectionState } from '../../realtime/connection'
import { formatPercent, formatPrice } from '../../lib/format'
import { applyLivePrice, reconcileLiveBar } from '../../lib/liveCandle'
import { timeframeSeconds } from '../../lib/timeframes'
import { ErrorState } from '../ui/ErrorState'
import { IconButton } from '../ui/IconButton'
import { ChartSettingsDialog, type ChartType, type DrawingTool, type SettingsTab } from './ChartSettingsDialog'
import { IndicatorLegend, IndicatorPanels } from './IndicatorPanels'
import {
  COMPACT_PANEL_HEIGHT, OSCILLATOR_PANEL_HEIGHT, alligator as calcAlligator, bollinger as calcBollinger, defaultIndicatorSettings, emaOfCloses, fractals as calcFractals, getIndicator,
  parabolicSar, sanitizeIndicatorSettings, sma as calcSma, toPoints,
  type IndicatorId, type IndicatorSettings, type Series,
} from '../../lib/indicators'

type DrawingShape = Exclude<DrawingTool, 'none'>
type Drawing = { id: string; type: DrawingShape; x1: number; y1: number; x2: number; y2: number; text?: string; price?: number }

// One shared empty array, so "no data" has a stable identity and does not look like new data to effects.
const NO_CANDLES: ChartCandle[] = []
const indicatorStorageKey = 'slspot.chart.indicator-settings.v2'
const legacyIndicatorStorageKey = 'slspot.chart.indicators'
const drawingStoragePrefix = 'slspot.chart.drawings:'

function readStoredDrawings(storageKey: string): Drawing[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Drawing => Boolean(
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.type === 'string',
      ))
      : []
  } catch {
    return []
  }
}
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
  /** Opens the positions / history / wallet dialog. */
  onOpenActivity: () => void
  soundEnabled: boolean
  onToggleSound: () => void
  openTrades: OpenTrade[]
  now: number
  realtimeState: RealtimeConnectionState
}

const timeframes = ['1m', '5m', '15m', '30m', '1H', '4H', '1D']

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds)
  if (safe < 60) return safe + 's'
  const minutes = Math.floor(safe / 60)
  const remainder = safe % 60
  return minutes + ':' + remainder.toString().padStart(2, '0')
}

type PriceLineHandle = { applyOptions: (options: Record<string, unknown>) => void }
type EntryLine = { id: string; direction: 'UP' | 'DOWN'; price: number; title: string }

function ChartCanvas({
  asset,
  datasetKey,
  intervalSeconds,
  chartType,
  crosshairEnabled,
  gridEnabled,
  priceLineEnabled,
  indicators,
  volumeEnabled,
  candles,
  usingMockCandles,
  entryLines,
}: {
  asset: MarketAsset
  datasetKey: string
  /** Candle length in seconds, used to roll the live candle over at the period boundary. */
  intervalSeconds: number
  chartType: ChartType
  crosshairEnabled: boolean
  gridEnabled: boolean
  priceLineEnabled: boolean
  indicators: IndicatorSettings
  volumeEnabled: boolean
  candles: ChartCandle[]
  usingMockCandles: boolean
  /** One price line per open trade, drawn at its real entry price on the chart's own price scale. */
  entryLines: EntryLine[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const primarySeriesRef = useRef<unknown>(null)
  const indicatorSeriesRef = useRef<Map<string, unknown>>(new Map())
  const volumeSeriesRef = useRef<unknown>(null)
  const priceLineRef = useRef<{ applyOptions: (options: { price: number }) => void } | null>(null)
  const fittedDatasetRef = useRef<string | null>(null)
  /** The candle currently being extended by live ticks (accumulates high/low between ticks). */
  const liveBarRef = useRef<ChartCandle | null>(null)
  const liveBarDatasetRef = useRef<string | null>(null)
  const targetPriceRef = useRef(asset.price)
  const displayPriceRef = useRef(asset.price)
  const animationFrameRef = useRef<number | null>(null)
  const entryLinesRef = useRef<Map<string, PriceLineHandle>>(new Map())
  const closes = useMemo(
    () => candles.map((candle) => ({ time: candle.time, value: candle.close })),
    [candles],
  )

  useEffect(() => {
    const indicatorSeries = indicatorSeriesRef.current
    const container = containerRef.current
    const entryLineHandles = entryLinesRef.current
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
      indicatorSeries.clear()
      volumeSeriesRef.current = null
      priceLineRef.current = null
      entryLineHandles.clear()
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

    indicatorSeriesRef.current.forEach((series) => chart.removeSeries(series as never))
    indicatorSeriesRef.current.clear()

    const line = (key: string, values: Series, color: string, width: number, marker?: number) => {
      const series = chart.addSeries(LineSeries, {
        color,
        lineWidth: Math.min(4, Math.max(1, width)) as 1 | 2 | 3 | 4,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        ...(marker ? { lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: marker } : {}),
      })
      series.setData(toPoints(candles, values) as Array<{ time: UTCTimestamp; value: number }>)
      indicatorSeriesRef.current.set(key, series)
    }

    for (const id of indicators.enabled) {
      if (getIndicator(id).group !== 'overlay') continue
      const { params, colors, width } = indicators.configs[id]
      if (id === 'sma') line(id, calcSma(candles, params.period!), colors.line!, width)
      else if (id === 'ema') line(id, emaOfCloses(candles, params.period!), colors.line!, width)
      else if (id === 'bollinger') {
        const bands = calcBollinger(candles, params.period!, params.deviation!)
        line('bollinger-upper', bands.upper, colors.upper!, width)
        line('bollinger-lower', bands.lower, colors.lower!, width)
        line('bollinger-basis', bands.basis, colors.basis!, width)
      } else if (id === 'psar') line(id, parabolicSar(candles, params.step!, params.max!), colors.dots!, 1, 2)
      else if (id === 'alligator') {
        const lines = calcAlligator(candles, params)
        line('alligator-jaw', lines.jaw, colors.jaw!, width)
        line('alligator-teeth', lines.teeth, colors.teeth!, width)
        line('alligator-lips', lines.lips, colors.lips!, width)
      } else if (id === 'fractal') {
        const marks = calcFractals(candles, params.side!)
        line('fractal-up', marks.up, colors.up!, 1, 3)
        line('fractal-down', marks.down, colors.down!, 1, 3)
      }
    }
  }, [candles, chartType, indicators])

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
  }, [chartType, priceLineEnabled])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const existing = volumeSeriesRef.current as { setData: (data: unknown[]) => void } | null
    if (!volumeEnabled) {
      if (existing) {
        chart.removeSeries(existing as never)
        volumeSeriesRef.current = null
      }
      return
    }

    const series = existing ?? chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      color: 'rgba(255,194,26,.28)',
      base: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
      visible: false,
    })
    volumeSeriesRef.current = series
    series.setData(candles.map((candle) => ({
      time: candle.time,
      value: Number.isFinite(candle.volume) ? candle.volume : 0,
      color: candle.close >= candle.open ? 'rgba(31,210,122,.25)' : 'rgba(255,77,94,.25)',
    })))
  }, [candles, chartType, volumeEnabled])

  // New candle data (load, timeframe change, server candle event) restarts the live candle from the
  // server's last bar, unless this client already started a newer candle locally (see reconcileLiveBar).
  useEffect(() => {
    const serverLast = candles[candles.length - 1] ?? null
    const keep = liveBarDatasetRef.current === datasetKey ? liveBarRef.current : null
    const reconciled = reconcileLiveBar(keep, serverLast)
    liveBarRef.current = reconciled
    liveBarDatasetRef.current = datasetKey
    targetPriceRef.current = asset.price
    if (reconciled) displayPriceRef.current = reconciled.close
  }, [candles, datasetKey])

  // Raw provider updates arrive in batches, but the chart renderer is independent from React's
  // render cadence. It eases the displayed price toward the newest server tick at ~60fps, while
  // every settlement continues to use the raw server-authoritative market price.
  useEffect(() => {
    targetPriceRef.current = asset.price
  }, [asset.price])

  useEffect(() => {
    const primary = primarySeriesRef.current as { update: (data: unknown) => void } | null
    if (!primary) return undefined

    let previousFrame = performance.now()
    const animate = (frameTime: number) => {
      const target = targetPriceRef.current
      const last = liveBarRef.current
      if (last && Number.isFinite(target) && target > 0) {
        const elapsed = Math.min(100, Math.max(1, frameTime - previousFrame))
        previousFrame = frameTime

        const current = Number.isFinite(displayPriceRef.current) && displayPriceRef.current > 0
          ? displayPriceRef.current
          : last.close
        const alpha = 1 - Math.exp(-elapsed / 80)
        const nextPrice = current + (target - current) * alpha

        if (Math.abs(nextPrice - current) > Math.max(1e-10, Math.abs(current) * 1e-9)) {
          const next = applyLivePrice(last, nextPrice, intervalSeconds, frameTime / 1000)
          liveBarRef.current = next
          displayPriceRef.current = next.close

          if (chartType === 'candles') {
            primary.update(next)
          } else {
            primary.update({ time: next.time, value: next.close })
          }

          priceLineRef.current?.applyOptions({ price: next.close })

          if (next.time !== last.time) {
            const volumeSeries = volumeSeriesRef.current as { update: (data: unknown) => void } | null
            volumeSeries?.update({
              time: next.time,
              value: next.volume ?? 0,
              color: 'rgba(255,194,26,.28)',
            })
          }
        }
      }

      animationFrameRef.current = requestAnimationFrame(animate)
    }

    animationFrameRef.current = requestAnimationFrame(animate)
    return () => {
      if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
  }, [asset.symbol, chartType, intervalSeconds])

  // Entry price lines for open trades. The chart owns the price scale, so the line sits at the real
  // price and follows zoom, pan and auto-scaling.
  useEffect(() => {
    const series = primarySeriesRef.current as {
      createPriceLine: (options: unknown) => PriceLineHandle
      removePriceLine: (line: PriceLineHandle) => void
    } | null
    if (!series) return

    const lines = entryLinesRef.current
    const wanted = new Set(entryLines.map((line) => line.id))
    for (const [id, line] of lines) {
      if (wanted.has(id)) continue
      series.removePriceLine(line)
      lines.delete(id)
    }

    for (const entry of entryLines) {
      const options = {
        price: entry.price,
        color: entry.direction === 'UP' ? '#1fd27a' : '#ff4d5e',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: entry.title,
      }
      const existing = lines.get(entry.id)
      if (existing) existing.applyOptions(options)
      else lines.set(entry.id, series.createPriceLine(options))
    }
  }, [entryLines, chartType, asset.symbol])

  return (
    <div className="chart-canvas-shell">
      <div
        ref={containerRef}
        className="chart-canvas"
        role="img"
        aria-label={asset.symbol + ' ' + chartType + ' market chart'}
      />
      <div className="chart-attribution">{usingMockCandles ? 'Demo fallback' : 'Server OHLC'} · Volume {volumeEnabled ? 'on' : 'off'}</div>
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
    volume: Number(candle.volume),
  }))
}

export function ChartWorkspace({ asset, onOpenMarkets, onOpenActivity, soundEnabled, onToggleSound, openTrades, now, realtimeState }: ChartWorkspaceProps) {
  const [timeframe, setTimeframe] = useState('5m')
  const [crosshairEnabled, setCrosshairEnabled] = useState(true)
  const [gridEnabled, setGridEnabled] = useState(true)
  const [priceLineEnabled, setPriceLineEnabled] = useState(true)
  const [indicators, setIndicators] = useState<IndicatorSettings>(() => {
    try {
      const stored = window.localStorage.getItem(indicatorStorageKey)
      if (stored) return sanitizeIndicatorSettings(JSON.parse(stored))
      // Carry over the indicator selection saved by the previous version.
      const legacy = JSON.parse(window.localStorage.getItem(legacyIndicatorStorageKey) ?? 'null')
      return Array.isArray(legacy) ? sanitizeIndicatorSettings({ enabled: legacy }) : defaultIndicatorSettings()
    } catch {
      return defaultIndicatorSettings()
    }
  })
  const [volumeEnabled, setVolumeEnabled] = useState(true)
  const [chartType, setChartType] = useState<ChartType>('candles')
  const compact = useMediaQuery('(max-width: 820px)')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('chart')
  const [selectedIndicator, setSelectedIndicator] = useState<IndicatorId>('sma')
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('none')
  const drawingStorageKey = drawingStoragePrefix + asset.symbol + ':' + timeframe
  const [drawings, setDrawings] = useState<Drawing[]>(() => readStoredDrawings(drawingStorageKey))
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)
  const [activeDrawing, setActiveDrawing] = useState<Drawing | null>(null)
  const workspaceRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const price = formatPrice(asset.price, asset.price < 10 ? 5 : 2)
  const marketInterval = timeframeToApiInterval(timeframe)
  const realtime = useRealtime()
  const candleResource = useMarketCandles(asset.assetId, marketInterval, 200)
  const usingMockCandles = import.meta.env.DEV && (
    Boolean(candleResource.error) ||
    (candleResource.data !== null && candleResource.data.candles.length === 0)
  )
  // Dev-only demo series. Generated once per symbol/timeframe: depending on the whole `asset`
  // object regenerated it (and rebuilt every chart series) on every live price tick.
  const mockCandles = useMemo(
    () => (usingMockCandles
      ? generateMockCandles(asset, timeframe).map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: 0,
      }))
      : NO_CANDLES),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [asset.symbol, timeframe, usingMockCandles],
  )
  const datasetKey = asset.symbol + ':' + marketInterval
  const entryLines = useMemo<EntryLine[]>(
    () => openTrades
      .filter((trade) => trade.symbol === asset.symbol && Number.isFinite(trade.entryPrice) && trade.entryPrice > 0)
      .map((trade) => ({
        id: trade.id,
        direction: trade.direction,
        price: trade.entryPrice,
        title: trade.direction + ' ' + formatCountdown(tradeRemainingSeconds(trade, now)),
      })),
    [asset.symbol, now, openTrades],
  )
  const [liveCandleUpdates, setLiveCandleUpdates] = useState<Array<ChartCandle & { datasetKey: string }>>([])
  const baseCandles = useMemo(
    () => candleResource.data?.candles.length ? toChartCandles(candleResource.data.candles) : usingMockCandles ? mockCandles : NO_CANDLES,
    [candleResource.data, mockCandles, usingMockCandles],
  )

  useEffect(() => {
    return realtime.onEvent((event) => {
      if (event.type !== 'market.candle') return
      const data = event.data as Partial<MarketCandle>
      if (
        data.assetId !== asset.assetId ||
        data.symbol !== asset.symbol ||
        data.interval !== marketInterval ||
        typeof data.openTime !== 'string' ||
        typeof data.closeTime !== 'string' ||
        typeof data.open !== 'string' ||
        typeof data.high !== 'string' ||
        typeof data.low !== 'string' ||
        typeof data.close !== 'string' ||
        typeof data.volume !== 'string'
      ) return

      const next = {
        time: Math.floor(Date.parse(data.openTime) / 1000) as import('lightweight-charts').UTCTimestamp,
        open: Number(data.open),
        high: Number(data.high),
        low: Number(data.low),
        close: Number(data.close),
        volume: Number(data.volume),
      }
      if (!Number.isFinite(next.time) || !Number.isFinite(next.open) || !Number.isFinite(next.high) || !Number.isFinite(next.low) || !Number.isFinite(next.close)) return

      setLiveCandleUpdates((current) => {
        const nextUpdate = { ...next, datasetKey }
        const withoutSame = current.filter((item) => !(item.datasetKey === datasetKey && Number(item.time) === Number(next.time)))
        return [...withoutSame, nextUpdate].slice(-200)
      })
    })
  }, [asset.assetId, asset.symbol, datasetKey, marketInterval, realtime])

  const candles = useMemo(() => {
    const updates = liveCandleUpdates.filter((item) => item.datasetKey === datasetKey)
    if (!updates.length) return baseCandles
    const merged = new Map<number, ChartCandle>()
    for (const candle of baseCandles) merged.set(Number(candle.time), candle)
    for (const update of updates) {
      const candle: ChartCandle = {
        time: update.time,
        open: update.open,
        high: update.high,
        low: update.low,
        close: update.close,
        volume: update.volume,
      }
      merged.set(Number(candle.time), candle)
    }
    return [...merged.values()].sort((left, right) => Number(left.time) - Number(right.time)).slice(-200)
  }, [baseCandles, datasetKey, liveCandleUpdates])
  useEffect(() => {
    try {
      window.localStorage.setItem(indicatorStorageKey, JSON.stringify(indicators))
    } catch {
      // Storage can be unavailable (private mode); settings then last for the session only.
    }
  }, [indicators])

  useEffect(() => {
    window.localStorage.setItem(drawingStorageKey, JSON.stringify(drawings))
  }, [drawingStorageKey, drawings])

  const changeTimeframe = (value: string) => {
    setTimeframe(value)
    setDrawings(readStoredDrawings(drawingStoragePrefix + asset.symbol + ':' + value))
    setSelectedDrawingId(null)
    setActiveDrawing(null)
  }
  const openSettings = (tab: SettingsTab, indicator?: IndicatorId) => {
    // The dialog is rendered on the page, so leave fullscreen first or it would be hidden.
    if (document.fullscreenElement) void document.exitFullscreen()
    setSettingsTab(tab)
    if (indicator) setSelectedIndicator(indicator)
    setSettingsOpen(true)
  }
  const removeIndicator = (id: IndicatorId) => setIndicators((current) => ({ ...current, enabled: current.enabled.filter((item) => item !== id) }))
  const resetChart = () => {
    setCrosshairEnabled(true); setGridEnabled(true); setPriceLineEnabled(true); setVolumeEnabled(true)
    setIndicators(defaultIndicatorSettings()); setChartType('candles'); setDrawingTool('none'); setSelectedDrawingId(null)
  }

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

  const priceFromPoint = (y: number) => {
    if (!candles.length) return asset.price
    const high = Math.max(...candles.map((item) => item.high))
    const low = Math.min(...candles.map((item) => item.low))
    return high - (y / 100) * (high - low)
  }

  useEffect(() => {
    if (drawingTool === 'none') return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDrawing(null)
        setDrawingTool('none')
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedDrawingId) {
        setDrawings((current) => current.filter((item) => item.id !== selectedDrawingId))
        setSelectedDrawingId(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [drawingTool, selectedDrawingId])

  const handleDrawingStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drawingTool === 'none') return
    const point = toPercentPoint(event)
    const next: Drawing = {
      id: crypto.randomUUID(),
      type: drawingTool,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      ...(drawingTool === 'price' ? { price: priceFromPoint(point.y) } : {}),
    }
    if (drawingTool === 'text') {
      const text = window.prompt('Annotation text', 'Note')
      setDrawingTool('none')
      if (text?.trim()) setDrawings((current) => [...current, { ...next, text: text.trim() }])
      return
    }
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
    if (['horizontal', 'vertical', 'price'].includes(drawingTool)) setDrawingTool('none')
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const feedAgeMs = asset.lastUpdatedAt ? Math.max(0, now - Date.parse(asset.lastUpdatedAt)) : Number.POSITIVE_INFINITY
  const feedAgeSeconds = Number.isFinite(feedAgeMs) ? Math.floor(feedAgeMs / 1000) : null
  const feedStale = !usingMockCandles && (!Number.isFinite(feedAgeMs) || feedAgeMs > 45_000)
  const oscillatorCount = indicators.enabled.filter((id) => getIndicator(id).group === 'oscillator').length
  const hasOscillators = oscillatorCount > 0

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
            <button className={timeframe === value ? 'timeframe timeframe--active' : 'timeframe'} key={value} onClick={() => changeTimeframe(value)} type="button" aria-pressed={timeframe === value}>{value}</button>
          ))}
        </div>

        <div className="chart-tools" aria-label="Chart controls">
          <button type="button" className="chart-timeframe-chip" onClick={() => openSettings('chart')} aria-label={'Timeframe ' + timeframe + '. Change in chart settings'}>{timeframe}</button>
          <span className="chart-tools__extra">
            <IconButton label={crosshairEnabled ? 'Disable crosshair' : 'Enable crosshair'} active={crosshairEnabled} onClick={() => setCrosshairEnabled((value) => !value)}><Crosshair size={16} /></IconButton>
          </span>
          <IconButton label="Chart settings" active={settingsOpen} onClick={() => openSettings('chart')} aria-haspopup="dialog"><Settings2 size={16} /></IconButton>
          <button type="button" className="chart-activity-button" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); onOpenActivity() }} title="Open positions, trade history and wallet activity">
            <Clock3 size={15} />
            <span>Positions</span>
            {openTrades.length > 0 ? <span className="chart-activity-button__count">{openTrades.length}</span> : null}
          </button>
          <span className="chart-tools__extra">
            <IconButton label="Fullscreen chart" onClick={handleFullscreen}><Maximize2 size={16} /></IconButton>
          </span>
        </div>
      </div>

      <div className={'chart-stage' + (hasOscillators ? ' chart-stage--oscillators' : '')} ref={stageRef} style={hasOscillators ? ({ '--oscillator-height': (oscillatorCount * (compact ? COMPACT_PANEL_HEIGHT : OSCILLATOR_PANEL_HEIGHT)) + 'px' } as React.CSSProperties) : undefined}>
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
            intervalSeconds={timeframeSeconds[timeframe] ?? 300}
            chartType={chartType}
            crosshairEnabled={crosshairEnabled}
            gridEnabled={gridEnabled}
            priceLineEnabled={priceLineEnabled}
            indicators={indicators}
            volumeEnabled={volumeEnabled}
            candles={candles}
            usingMockCandles={usingMockCandles}
            entryLines={entryLines}
          />
        )}

        {drawingTool !== 'none' && candles.length ? (
          <div className="drawing-layer" onPointerDown={handleDrawingStart} onPointerMove={handleDrawingMove} onPointerUp={handleDrawingEnd} onPointerCancel={handleDrawingEnd} role="application" aria-label="Drawing canvas">
            <div className="drawing-layer__hint">{drawingTool === 'horizontal' ? 'Click to place a level' : 'Drag to draw a trend line'} · Esc to cancel</div>
          </div>
        ) : null}

        <svg className="drawing-layer-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Chart drawings">
          {[...drawings, ...(activeDrawing ? [activeDrawing] : [])].map((drawing) => {
            const selected = drawing.id === selectedDrawingId
            const className = selected ? 'drawing-shape drawing-shape--selected' : 'drawing-shape'
            const select = (event: ReactPointerEvent<SVGElement>) => { event.stopPropagation(); setSelectedDrawingId(drawing.id) }
            if (drawing.type === 'horizontal' || drawing.type === 'price') {
              return <line key={drawing.id} className={className} x1="0" x2="100" y1={drawing.y1} y2={drawing.y1} onPointerDown={select} />
            }
            if (drawing.type === 'vertical') {
              return <line key={drawing.id} className={className} x1={drawing.x1} x2={drawing.x1} y1="0" y2="100" onPointerDown={select} />
            }
            if (drawing.type === 'rectangle') {
              return <rect key={drawing.id} className={className} x={Math.min(drawing.x1, drawing.x2)} y={Math.min(drawing.y1, drawing.y2)} width={Math.abs(drawing.x2 - drawing.x1)} height={Math.abs(drawing.y2 - drawing.y1)} onPointerDown={select} />
            }
            if (drawing.type === 'fibonacci') {
              return <g key={drawing.id} className={className} onPointerDown={select}>{[0, .236, .382, .5, .618, 1].map((ratio) => { const y = drawing.y1 + (drawing.y2 - drawing.y1) * ratio; return <line key={ratio} x1={Math.min(drawing.x1, drawing.x2)} x2={Math.max(drawing.x1, drawing.x2)} y1={y} y2={y} /> })}</g>
            }
            if (drawing.type === 'ray') {
              const dx = drawing.x2 - drawing.x1
              const dy = drawing.y2 - drawing.y1
              const endX = dx >= 0 ? 100 : 0
              const endY = Math.abs(dx) < 0.001 ? drawing.y1 : drawing.y1 + (endX - drawing.x1) * (dy / dx)
              return <line key={drawing.id} className={className} x1={drawing.x1} y1={drawing.y1} x2={endX} y2={Math.max(-200, Math.min(300, endY))} onPointerDown={select} />
            }
            if (drawing.type === 'text') {
              return <text key={drawing.id} className={selected ? 'drawing-text drawing-text--selected' : 'drawing-text'} x={drawing.x1} y={drawing.y1} onPointerDown={select}>{drawing.text ?? 'Note'}</text>
            }
            return <line key={drawing.id} className={className} x1={drawing.x1} y1={drawing.y1} x2={drawing.x2} y2={drawing.y2} onPointerDown={select} />
          })}
        </svg>

        {priceLineEnabled && candles.length ? <div className="chart-price-tag"><span>{price}</span><small>{formatPercent(asset.change)}</small></div> : null}

        {candles.length ? (
          <>
            <IndicatorLegend candles={candles} settings={indicators} onEdit={(id) => openSettings('indicators', id)} onRemove={removeIndicator} />
            <IndicatorPanels candles={candles} settings={indicators} onEdit={(id) => openSettings('indicators', id)} onRemove={removeIndicator} />
          </>
        ) : null}
      </div>

      <div className="chart-bottom-status">
        <span className={feedStale ? 'chart-feed-state chart-feed-state--stale' : 'chart-feed-state'}>
          <i className={(feedStale || realtimeState !== 'connected') ? 'live-dot live-dot--muted' : 'live-dot'} />
          {realtimeState === 'connected'
            ? feedStale
              ? 'Stale feed' + (feedAgeSeconds !== null ? ' · ' + feedAgeSeconds + 's' : '')
              : candleResource.data?.candles.length ? 'Live market data' : usingMockCandles ? 'Demo market data' : 'Waiting for market data'
            : realtimeState === 'reconnecting'
              ? 'Reconnecting to live feed'
              : realtimeState === 'connecting'
                ? 'Connecting to live feed'
                : 'Live feed offline'}
        </span>
        <span>{timeframe}</span>
        <span>{chartType === 'candles' ? 'Candles' : chartType === 'line' ? 'Line' : 'Area'}</span>
        <span className="chart-bottom-status__spacer" />
        <span className="chart-help-text">Scroll to zoom · drag to pan</span>
      </div>
      <ChartSettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tab={settingsTab}
        onTabChange={setSettingsTab}
        chartType={chartType}
        onChartType={setChartType}
        crosshair={crosshairEnabled}
        onCrosshair={setCrosshairEnabled}
        grid={gridEnabled}
        onGrid={setGridEnabled}
        priceLine={priceLineEnabled}
        onPriceLine={setPriceLineEnabled}
        volume={volumeEnabled}
        onVolume={setVolumeEnabled}
        indicators={indicators}
        onIndicators={setIndicators}
        selectedIndicator={selectedIndicator}
        onSelectIndicator={setSelectedIndicator}
        drawingTool={drawingTool}
        onDrawingTool={setDrawingTool}
        canRemoveSelectedDrawing={Boolean(selectedDrawingId)}
        drawingCount={drawings.length}
        onRemoveSelectedDrawing={() => { if (!selectedDrawingId) return; setDrawings((current) => current.filter((item) => item.id !== selectedDrawingId)); setSelectedDrawingId(null) }}
        onRemoveAllDrawings={() => { setDrawings([]); setSelectedDrawingId(null) }}
        onResetChart={resetChart}
        timeframe={timeframe}
        timeframes={timeframes}
        onTimeframe={changeTimeframe}
        soundEnabled={soundEnabled}
        onSound={onToggleSound}
      />
    </section>
  )
}
