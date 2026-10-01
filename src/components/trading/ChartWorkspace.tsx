import { CandlestickChart, ChevronDown, Crosshair, Maximize2, MoreHorizontal, Search, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, CrosshairMode, createChart, type IChartApi } from 'lightweight-charts'
import type { MarketAsset } from '../../data/mockMarket'
import { generateMockCandles } from '../../data/mockCandles'
import { formatPercent, formatPrice } from '../../lib/format'
import { IconButton } from '../ui/IconButton'

type ChartWorkspaceProps = { asset: MarketAsset; onOpenMarkets: () => void }
const timeframes = ['1m', '5m', '15m', '30m', '1H', '4H', '1D']

function ChartCanvas({ asset, timeframe, crosshairEnabled }: { asset: MarketAsset; timeframe: string; crosshairEnabled: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candles = useMemo(() => generateMockCandles(asset, timeframe), [asset, timeframe])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const chart = createChart(container, {
      width: container.clientWidth,
      height: Math.max(container.clientHeight, 260),
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#536770', attributionLogo: false },
      grid: { vertLines: { color: 'rgba(255,255,255,.035)' }, horzLines: { color: 'rgba(255,255,255,.035)' } },
      crosshair: {
        mode: crosshairEnabled ? CrosshairMode.Normal : CrosshairMode.Hidden,
        vertLine: { color: 'rgba(85,219,203,.28)', width: 1, labelVisible: crosshairEnabled },
        horzLine: { color: 'rgba(85,219,203,.18)', width: 1, labelVisible: crosshairEnabled },
      },
      rightPriceScale: { borderColor: 'rgba(196,229,240,.08)', scaleMargins: { top: 0.08, bottom: 0.1 } },
      timeScale: { borderColor: 'rgba(196,229,240,.08)', timeVisible: true, secondsVisible: false, rightOffset: 5 },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    })
    const series = chart.addSeries(CandlestickSeries, { upColor: '#52d98b', downColor: '#f06b78', borderVisible: false, wickUpColor: '#52d98b', wickDownColor: '#f06b78' })
    series.setData(candles)
    series.createPriceLine({ price: asset.price, color: '#55dbcb', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Last' })
    chart.timeScale().fitContent()
    chartRef.current = chart
    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      chart.applyOptions({ width: Math.floor(rect.width), height: Math.max(Math.floor(rect.height), 260) })
    })
    resizeObserver.observe(container)
    return () => { resizeObserver.disconnect(); chartRef.current = null; chart.remove() }
  }, [asset, candles, crosshairEnabled])

  return <div className="chart-canvas-shell"><div ref={containerRef} className="chart-canvas" role="img" aria-label={asset.symbol + ' candlestick market chart'} /><div className="chart-attribution">Demo OHLC</div></div>
}

export function ChartWorkspace({ asset, onOpenMarkets }: ChartWorkspaceProps) {
  const [timeframe, setTimeframe] = useState('5m')
  const [crosshairEnabled, setCrosshairEnabled] = useState(true)
  const workspaceRef = useRef<HTMLElement>(null)
  const price = formatPrice(asset.price, asset.price < 10 ? 5 : 2)
  const changeClass = asset.change >= 0 ? 'text-positive' : 'text-negative'

  const handleFullscreen = async () => {
    if (!workspaceRef.current) return
    if (document.fullscreenElement) { await document.exitFullscreen(); return }
    await workspaceRef.current.requestFullscreen()
  }

  return (
    <section ref={workspaceRef} className="chart-workspace panel">
      <div className="simple-chart-toolbar">
        <button className="market-trigger" type="button" onClick={onOpenMarkets} aria-label="Choose market" title="Choose market">
          <span className={'asset-icon asset-icon--' + asset.accent} aria-hidden="true">{asset.symbol.slice(0, 1)}</span>
          <span className="market-trigger__copy"><strong>{asset.symbol}</strong><small>{asset.name}</small></span>
          <span className="market-trigger__price"><strong>{price}</strong><small className={changeClass}>{formatPercent(asset.change)} 24h</small></span>
          <ChevronDown size={14} />
        </button>
        <div className="chart-timeframes" aria-label="Chart timeframe">
          {timeframes.map((value) => <button className={timeframe === value ? 'timeframe timeframe--active' : 'timeframe'} key={value} onClick={() => setTimeframe(value)} type="button" aria-pressed={timeframe === value}>{value}</button>)}
        </div>
        <div className="chart-tools" aria-label="Chart controls">
          <IconButton label={crosshairEnabled ? 'Disable crosshair' : 'Enable crosshair'} active={crosshairEnabled} className="chart-tool-icon" onClick={() => setCrosshairEnabled((value) => !value)}><Crosshair size={15} /></IconButton>
          <IconButton label="Chart settings" className="chart-tool-icon"><Settings2 size={15} /></IconButton>
          <IconButton label="Fullscreen chart" className="chart-tool-icon" onClick={handleFullscreen}><Maximize2 size={15} /></IconButton>
          <IconButton label="More chart options" className="chart-tool-icon"><MoreHorizontal size={15} /></IconButton>
        </div>
      </div>
      <div className="chart-stage"><ChartCanvas asset={asset} timeframe={timeframe} crosshairEnabled={crosshairEnabled} /><div className="chart-price-tag"><span>{price}</span><small>{formatPercent(asset.change)}</small></div></div>
      <div className="chart-bottom-status"><span><i className="live-dot" /> Demo market</span><span>{timeframe}</span><span className="chart-bottom-status__spacer" /><span className="chart-help-text">Scroll to zoom · drag to pan</span></div>
    </section>
  )
}
