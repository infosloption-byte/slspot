import { CandlestickChart, ChevronDown, Maximize2, MoreHorizontal, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CandlestickSeries, ColorType, CrosshairMode, createChart, type IChartApi } from 'lightweight-charts'
import type { MarketAsset } from '../../data/mockMarket'
import { generateMockCandles } from '../../data/mockCandles'
import { formatPrice } from '../../lib/format'

type ChartWorkspaceProps = {
  asset: MarketAsset
}

const timeframes = ['1m', '5m', '15m', '30m', '1H', '4H', '1D']

function ChartCanvas({ asset, timeframe }: { asset: MarketAsset; timeframe: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  const candles = useMemo(() => generateMockCandles(asset, timeframe), [asset, timeframe])

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#536770',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,.035)' },
        horzLines: { color: 'rgba(255,255,255,.035)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(85,219,203,.28)', width: 1 },
        horzLine: { color: 'rgba(85,219,203,.18)', width: 1 },
      },
      rightPriceScale: {
        borderColor: 'rgba(196,229,240,.08)',
        scaleMargins: { top: 0.08, bottom: 0.1 },
      },
      timeScale: {
        borderColor: 'rgba(196,229,240,.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#52d98b',
      downColor: '#f06b78',
      borderVisible: false,
      wickUpColor: '#52d98b',
      wickDownColor: '#f06b78',
    })

    series.setData(candles)
    series.createPriceLine({
      price: asset.price,
      color: '#55dbcb',
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: 'Last',
    })

    chart.timeScale().fitContent()
    chartRef.current = chart

    const resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (!rect) {
        return
      }
      chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) })
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      chartRef.current = null
      chart.remove()
    }
  }, [asset, candles])

  return (
    <div className="chart-canvas-shell">
      <div ref={containerRef} className="chart-canvas" role="img" aria-label={asset.symbol + ' candlestick market chart'} />
      <div className="chart-attribution">
        Charting by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a>
      </div>
    </div>
  )
}

export function ChartWorkspace({ asset }: ChartWorkspaceProps) {
  const [timeframe, setTimeframe] = useState('5m')
  const price = formatPrice(asset.price, asset.price < 10 ? 5 : 2)

  return (
    <section className="chart-workspace panel">
      <div className="chart-toolbar">
        <div className="chart-asset-title">
          <span className={'asset-icon asset-icon--' + asset.accent}>{asset.symbol.slice(0, 1)}</span>
          <div>
            <strong>{asset.symbol}</strong>
            <span>{asset.name}</span>
          </div>
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

        <div className="chart-tools">
          <button className="chart-tool-button" type="button" title="Candlestick chart">
            <CandlestickChart size={16} />
            <span>Candles</span>
            <ChevronDown size={13} />
          </button>
          <button className="chart-tool-button" type="button" title="Crosshair">
            <span className="chart-tool-crosshair" aria-hidden="true">+</span>
          </button>
          <button className="chart-tool-button" type="button" title="Chart settings"><Settings2 size={16} /></button>
          <button className="chart-tool-button" type="button" title="Fullscreen"><Maximize2 size={16} /></button>
          <button className="chart-tool-button" type="button" title="More chart options"><MoreHorizontal size={16} /></button>
        </div>
      </div>

      <div className="indicator-strip">
        <span>EMA 20 <b>Preview</b></span>
        <span>RSI 14 <b>Preview</b></span>
        <span>VOL <b>Preview</b></span>
      </div>

      <div className="chart-stage">
        <ChartCanvas asset={asset} timeframe={timeframe} />
        <div className="chart-price-tag">{price}</div>
      </div>

      <div className="chart-bottom-status">
        <span><i className="live-dot" /> Demo stream</span>
        <span>{timeframe}</span>
        <span>Mock OHLC</span>
      </div>
    </section>
  )
}
