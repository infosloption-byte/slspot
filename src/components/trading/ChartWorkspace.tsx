import { Check, Crosshair, Grid2X2, Maximize2, Plus, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, CrosshairMode, createChart, type IChartApi } from 'lightweight-charts'
import type { MarketAsset } from '../../data/mockMarket'
import { generateMockCandles } from '../../data/mockCandles'
import { formatPercent, formatPrice } from '../../lib/format'
import { IconButton } from '../ui/IconButton'

type ChartWorkspaceProps = { asset: MarketAsset; onOpenMarkets: () => void }
const timeframes = ['1m', '5m', '15m', '30m', '1H', '4H', '1D']

function ChartCanvas({
  asset,
  timeframe,
  crosshairEnabled,
  gridEnabled,
  priceLineEnabled,
}: {
  asset: MarketAsset
  timeframe: string
  crosshairEnabled: boolean
  gridEnabled: boolean
  priceLineEnabled: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candles = useMemo(() => generateMockCandles(asset, timeframe), [asset, timeframe])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const chart = createChart(container, {
      width: container.clientWidth,
      height: Math.max(container.clientHeight, 260),
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#6c6c76', attributionLogo: false },
      grid: {
        vertLines: { color: gridEnabled ? 'rgba(255,255,255,.04)' : 'transparent' },
        horzLines: { color: gridEnabled ? 'rgba(255,255,255,.04)' : 'transparent' },
      },
      crosshair: {
        mode: crosshairEnabled ? CrosshairMode.Normal : CrosshairMode.Hidden,
        vertLine: { color: 'rgba(255,194,26,.4)', width: 1, labelBackgroundColor: '#2a2a31', labelVisible: crosshairEnabled },
        horzLine: { color: 'rgba(255,194,26,.25)', width: 1, labelBackgroundColor: '#2a2a31', labelVisible: crosshairEnabled },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,.07)', scaleMargins: { top: 0.08, bottom: 0.1 } },
      timeScale: { borderColor: 'rgba(255,255,255,.07)', timeVisible: true, secondsVisible: false, rightOffset: 5 },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    })

    const series = chart.addSeries(CandlestickSeries, { upColor: '#1fd27a', downColor: '#ff4d5e', borderVisible: false, lastValueVisible: false, priceLineVisible: false, wickUpColor: '#1fd27a', wickDownColor: '#ff4d5e' })
    series.setData(candles)
    if (priceLineEnabled) {
      series.createPriceLine({ price: asset.price, color: '#ffc21a', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Last' })
    }

    chart.timeScale().fitContent()
    chartRef.current = chart

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) return
      chart.applyOptions({ width: Math.floor(rect.width), height: Math.max(Math.floor(rect.height), 260) })
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      chartRef.current = null
      chart.remove()
    }
  }, [asset, candles, crosshairEnabled, gridEnabled, priceLineEnabled])

  return (
    <div className="chart-canvas-shell">
      <div ref={containerRef} className="chart-canvas" role="img" aria-label={asset.symbol + ' candlestick market chart'} />
      <div className="chart-attribution">Demo OHLC</div>
    </div>
  )
}

export function ChartWorkspace({ asset, onOpenMarkets }: ChartWorkspaceProps) {
  const [timeframe, setTimeframe] = useState('5m')
  const [crosshairEnabled, setCrosshairEnabled] = useState(true)
  const [gridEnabled, setGridEnabled] = useState(true)
  const [priceLineEnabled, setPriceLineEnabled] = useState(true)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const workspaceRef = useRef<HTMLElement>(null)
  const optionsRef = useRef<HTMLDivElement>(null)
  const price = formatPrice(asset.price, asset.price < 10 ? 5 : 2)
  const changeClass = asset.change >= 0 ? 'text-positive' : 'text-negative'

  useEffect(() => {
    if (!optionsOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(event.target as Node)) {
        setOptionsOpen(false)
      }
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

  return (
    <section ref={workspaceRef} className="chart-workspace panel">
      <div className="simple-chart-toolbar">
        <div className="asset-tabs">
          <button className="market-trigger" type="button" onClick={onOpenMarkets} aria-label="Choose market" title="Choose market">
            <span className={'asset-icon asset-icon--' + asset.accent} aria-hidden="true">{asset.symbol.slice(0, 1)}</span>
            <span className="market-trigger__copy"><strong>{asset.symbol}</strong><small>{asset.category}</small></span>
            <span className="market-trigger__price"><strong>{price}</strong><small className={changeClass}>{formatPercent(asset.change)}</small></span>
          </button>
          <button className="asset-tabs__add" type="button" onClick={onOpenMarkets} aria-label="Add or change market" title="Markets">
            <Plus size={16} strokeWidth={2.4} />
          </button>
        </div>

        <div className="chart-timeframes" aria-label="Chart timeframe">
          {timeframes.map((value) => (
            <button
              className={timeframe === value ? 'timeframe timeframe--active' : 'timeframe'}
              key={value}
              onClick={() => setTimeframe(value)}
              type="button"
              aria-pressed={timeframe === value}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="chart-tools" aria-label="Chart controls">
          <IconButton
            label={crosshairEnabled ? 'Disable crosshair' : 'Enable crosshair'}
            active={crosshairEnabled}
            className="chart-tool-icon"
            onClick={() => setCrosshairEnabled((value) => !value)}
          >
            <Crosshair size={15} />
          </IconButton>
          <div className="chart-options" ref={optionsRef}>
            <IconButton
              label="Chart options"
              active={optionsOpen}
              className="chart-tool-icon"
              onClick={() => setOptionsOpen((value) => !value)}
              aria-expanded={optionsOpen}
              aria-haspopup="dialog"
            >
              <Settings2 size={15} />
            </IconButton>

            {optionsOpen && (
              <div className="chart-options__popover" role="dialog" aria-label="Chart options">
                <div className="chart-options__header">
                  <div>
                    <span>Chart options</span>
                    <small>Keep the chart clean</small>
                  </div>
                  <Settings2 size={14} aria-hidden="true" />
                </div>

                <button className="chart-option" type="button" onClick={() => setCrosshairEnabled((value) => !value)}>
                  <span><Crosshair size={14} /><span><strong>Crosshair</strong><small>Inspect exact candle values</small></span></span>
                  <span className={crosshairEnabled ? 'chart-option__check chart-option__check--active' : 'chart-option__check'}>{crosshairEnabled && <Check size={12} />}</span>
                </button>

                <button className="chart-option" type="button" onClick={() => setGridEnabled((value) => !value)}>
                  <span><Grid2X2 size={14} /><span><strong>Grid</strong><small>Show chart guide lines</small></span></span>
                  <span className={gridEnabled ? 'chart-option__check chart-option__check--active' : 'chart-option__check'}>{gridEnabled && <Check size={12} />}</span>
                </button>

                <button className="chart-option" type="button" onClick={() => setPriceLineEnabled((value) => !value)}>
                  <span><span className="chart-option__line-icon" /><span><strong>Last price</strong><small>Show the current-price marker</small></span></span>
                  <span className={priceLineEnabled ? 'chart-option__check chart-option__check--active' : 'chart-option__check'}>{priceLineEnabled && <Check size={12} />}</span>
                </button>
              </div>
            )}
          </div>
          <IconButton label="Fullscreen chart" className="chart-tool-icon" onClick={handleFullscreen}>
            <Maximize2 size={15} />
          </IconButton>
        </div>
      </div>

      <div className="chart-stage">
        <ChartCanvas
          asset={asset}
          timeframe={timeframe}
          crosshairEnabled={crosshairEnabled}
          gridEnabled={gridEnabled}
          priceLineEnabled={priceLineEnabled}
        />
      </div>

      <div className="chart-bottom-status">
        <span><i className="live-dot" /> Demo market</span>
        <span>{timeframe}</span>
        <span className="chart-bottom-status__spacer" />
        <span className="chart-help-text">Scroll to zoom · drag to pan</span>
      </div>
    </section>
  )
}
