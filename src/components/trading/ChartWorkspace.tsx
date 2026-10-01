import { CandlestickChart, ChevronDown, Crosshair, Maximize2, MoreHorizontal, Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MarketAsset } from '../../data/mockMarket'
import { formatPrice } from '../../lib/format'

const chartPoints = [
  0.32, 0.38, 0.34, 0.44, 0.42, 0.48, 0.41, 0.52, 0.50, 0.59, 0.54, 0.66,
  0.61, 0.58, 0.64, 0.71, 0.67, 0.76, 0.72, 0.8, 0.77, 0.86, 0.83, 0.92,
]

const timeLabels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']

function makePolyline(points: number[], width: number, height: number): string {
  return points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width
      const y = (1 - point) * (height - 24) + 12
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

type ChartWorkspaceProps = {
  asset: MarketAsset
}

export function ChartWorkspace({ asset }: ChartWorkspaceProps) {
  const [timeframe, setTimeframe] = useState('5m')
  const polyline = useMemo(() => makePolyline(chartPoints, 880, 390), [])
  const price = formatPrice(asset.price, asset.price < 10 ? 5 : 2)

  return (
    <section className="chart-workspace panel">
      <div className="chart-toolbar">
        <div className="chart-asset-title">
          <span className="asset-icon asset-icon--btc">{asset.symbol.slice(0, 1)}</span>
          <div>
            <strong>{asset.symbol}</strong>
            <span>{asset.name}</span>
          </div>
        </div>

        <div className="chart-timeframes" aria-label="Chart timeframe">
          {['1m', '5m', '15m', '1H', '4H', '1D'].map((value) => (
            <button className={timeframe === value ? 'timeframe timeframe--active' : 'timeframe'} key={value} onClick={() => setTimeframe(value)} type="button">
              {value}
            </button>
          ))}
        </div>

        <div className="chart-tools">
          <button className="chart-tool-button" type="button"><CandlestickChart size={16} /> <span>Candles</span> <ChevronDown size={13} /></button>
          <button className="chart-tool-button" type="button"><Crosshair size={16} /></button>
          <button className="chart-tool-button" type="button"><Settings2 size={16} /></button>
          <button className="chart-tool-button" type="button"><Maximize2 size={16} /></button>
          <button className="chart-tool-button" type="button"><MoreHorizontal size={16} /></button>
        </div>
      </div>

      <div className="indicator-strip">
        <span>EMA 20 <b>112,934</b></span>
        <span>RSI 14 <b>63.4</b></span>
        <span>VOL <b>48.2M</b></span>
      </div>

      <div className="chart-stage">
        <div className="chart-grid chart-grid--vertical" />
        <div className="chart-grid chart-grid--horizontal" />
        <div className="chart-axis chart-axis--price">
          <span>{formatPrice(asset.price * 1.007)}</span>
          <span>{formatPrice(asset.price)}</span>
          <span>{formatPrice(asset.price * 0.993)}</span>
        </div>

        <svg className="chart-svg" viewBox="0 0 880 390" role="img" aria-label={`${asset.symbol} sample market chart`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgba(85, 219, 203, .20)" />
              <stop offset="100%" stopColor="rgba(85, 219, 203, 0)" />
            </linearGradient>
          </defs>
          <polyline points={`${polyline} 880,390 0,390`} fill="url(#area-fill)" stroke="none" />
          <polyline points={polyline} fill="none" stroke="#55dbcB" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1="78" x2="880" y2="78" stroke="rgba(255,255,255,.08)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          <line x1="0" y1="277" x2="880" y2="277" stroke="rgba(255,255,255,.08)" strokeDasharray="4 6" vectorEffect="non-scaling-stroke" />
          <circle cx="846" cy="62" r="4.5" fill="#f7b955" />
        </svg>

        <div className="chart-price-tag">{price}</div>
        <div className="chart-crosshair vertical" />
        <div className="chart-crosshair horizontal" />

        <div className="chart-axis chart-axis--time">
          {timeLabels.map((label) => <span key={label}>{label}</span>)}
        </div>
      </div>

      <div className="chart-bottom-status">
        <span><i className="live-dot" /> Streaming</span>
        <span>UTC+05:30</span>
        <span>Grid: clean</span>
      </div>
    </section>
  )
}
