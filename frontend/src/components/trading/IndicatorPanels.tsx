import { Settings2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  alligator as calcAlligator, atr as calcAtr, awesomeOscillator, bollinger as calcBollinger, emaOfCloses, fractals as calcFractals,
  getIndicator, indicatorLabel, macd as calcMacd, parabolicSar, rsi as calcRsi, sma as calcSma, stochastic as calcStochastic,
  type IndicatorCandle, type IndicatorId, type IndicatorSettings, type Series,
} from '../../lib/indicators'

type Layer =
  | { kind: 'line'; values: Series; color: string; width: number }
  | { kind: 'bars'; values: Series; up: string; down: string }

type Reading = { text: string; color: string }
type PanelSpec = { id: IndicatorId; title: string; layers: Layer[]; range?: [number, number]; guides: number[]; zero: boolean; readings: Reading[] }

const last = (values: Series) => {
  for (let index = values.length - 1; index >= 0; index -= 1) if (values[index] !== null) return values[index]!
  return null
}
const fmt = (value: number | null) => (value === null ? '—' : Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0'))

function buildPanel(id: IndicatorId, candles: IndicatorCandle[], settings: IndicatorSettings): PanelSpec {
  const config = settings.configs[id]
  const { params, colors, width } = config
  const title = indicatorLabel(id, config)

  if (id === 'rsi') {
    const values = calcRsi(candles, params.period!)
    return { id, title, layers: [{ kind: 'line', values, color: colors.line!, width }], range: [0, 100], guides: [params.oversold!, 50, params.overbought!], zero: false, readings: [{ text: fmt(last(values)), color: colors.line! }] }
  }
  if (id === 'stochastic') {
    const { k, d } = calcStochastic(candles, params.k!, params.smooth!, params.d!)
    return {
      id, title, range: [0, 100], guides: [params.oversold!, 50, params.overbought!], zero: false,
      layers: [{ kind: 'line', values: k, color: colors.k!, width }, { kind: 'line', values: d, color: colors.d!, width }],
      readings: [{ text: fmt(last(k)), color: colors.k! }, { text: fmt(last(d)), color: colors.d! }],
    }
  }
  if (id === 'macd') {
    const result = calcMacd(candles, params.fast!, params.slow!, params.signal!)
    return {
      id, title, guides: [], zero: true,
      layers: [
        { kind: 'bars', values: result.histogram, up: colors.up!, down: colors.down! },
        { kind: 'line', values: result.macd, color: colors.macd!, width },
        { kind: 'line', values: result.signal, color: colors.signal!, width },
      ],
      readings: [{ text: fmt(last(result.macd)), color: colors.macd! }, { text: fmt(last(result.signal)), color: colors.signal! }, { text: fmt(last(result.histogram)), color: (last(result.histogram) ?? 0) >= 0 ? colors.up! : colors.down! }],
    }
  }
  if (id === 'atr') {
    const values = calcAtr(candles, params.period!)
    return { id, title, layers: [{ kind: 'line', values, color: colors.line!, width }], guides: [], zero: false, readings: [{ text: fmt(last(values)), color: colors.line! }] }
  }
  // Awesome oscillator
  const values = awesomeOscillator(candles, params.fast!, params.slow!)
  return { id, title, layers: [{ kind: 'bars', values, up: colors.up!, down: colors.down! }], guides: [], zero: true, readings: [{ text: fmt(last(values)), color: (last(values) ?? 0) >= 0 ? colors.up! : colors.down! }] }
}

function Panel({ spec, onEdit, onRemove, switcher }: { spec: PanelSpec; onEdit: (id: IndicatorId) => void; onRemove: (id: IndicatorId) => void; switcher?: { options: PanelSpec[]; onSelect: (id: IndicatorId) => void } }) {
  const geometry = useMemo(() => {
    const count = spec.layers.reduce((max, layer) => Math.max(max, layer.values.length), 0)
    let min = spec.range?.[0] ?? Infinity
    let max = spec.range?.[1] ?? -Infinity
    if (!spec.range) {
      for (const layer of spec.layers) for (const value of layer.values) if (value !== null) { min = Math.min(min, value); max = Math.max(max, value) }
      if (spec.zero) { min = Math.min(min, 0); max = Math.max(max, 0) }
      if (!Number.isFinite(min) || !Number.isFinite(max)) { min = 0; max = 1 }
      if (min === max) { min -= 1; max += 1 }
      const pad = (max - min) * 0.12
      min -= pad
      max += pad
    }
    const x = (index: number) => (count <= 1 ? 50 : ((index + 0.5) / count) * 100)
    const y = (value: number) => 100 - ((value - min) / (max - min)) * 100
    return { count, x, y }
  }, [spec])

  const { count, x, y } = geometry
  const barWidth = count > 0 ? Math.max(0.2, (100 / count) * 0.7) : 0

  return (
    <div className="chart-indicator-panel">
      <div className="chart-indicator-panel__label">
        {switcher && switcher.options.length > 1 ? (
          <span className="chart-indicator-panel__tabs" role="tablist">
            {switcher.options.map((option) => (
              <button type="button" role="tab" key={option.id} aria-selected={option.id === spec.id} className={option.id === spec.id ? 'is-active' : undefined} onClick={() => switcher.onSelect(option.id)}>{getIndicator(option.id).name}</button>
            ))}
          </span>
        ) : null}
        <span>{spec.title}</span>
        {spec.readings.map((reading, index) => <strong key={index} style={{ color: reading.color }}>{reading.text}</strong>)}
      </div>
      <div className="chart-indicator-panel__actions">
        <button type="button" aria-label={'Edit ' + spec.title} title="Settings" onClick={() => onEdit(spec.id)}><Settings2 size={12} /></button>
        <button type="button" aria-label={'Remove ' + spec.title} title="Remove" onClick={() => onRemove(spec.id)}><X size={12} /></button>
      </div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={spec.title}>
        {spec.guides.map((value) => <line key={value} x1="0" x2="100" y1={y(value)} y2={y(value)} className="chart-indicator-panel__guide" />)}
        {spec.zero ? <line x1="0" x2="100" y1={y(0)} y2={y(0)} className="chart-indicator-panel__guide" /> : null}
        {spec.layers.map((layer, layerIndex) => {
          if (layer.kind === 'bars') {
            return (
              <g key={layerIndex}>
                {layer.values.map((value, index) => {
                  if (value === null) return null
                  const top = Math.min(y(value), y(0))
                  return <rect key={index} x={x(index) - barWidth / 2} y={top} width={barWidth} height={Math.max(0.3, Math.abs(y(value) - y(0)))} fill={value >= 0 ? layer.up : layer.down} opacity="0.85" />
                })}
              </g>
            )
          }
          const points = layer.values.flatMap((value, index) => (value === null ? [] : [x(index).toFixed(2) + ',' + y(value).toFixed(2)])).join(' ')
          return <polyline key={layerIndex} points={points} fill="none" stroke={layer.color} strokeWidth={layer.width} vectorEffect="non-scaling-stroke" />
        })}
      </svg>
    </div>
  )
}

export function IndicatorPanels({ candles, settings, compact, onEdit, onRemove }: {
  candles: IndicatorCandle[]
  settings: IndicatorSettings
  /** Phone layout: one panel at a time with a switcher, instead of a stack. */
  compact: boolean
  onEdit: (id: IndicatorId) => void
  onRemove: (id: IndicatorId) => void
}) {
  const specs = useMemo(
    () => settings.enabled.filter((id) => getIndicator(id).group === 'oscillator').map((id) => buildPanel(id, candles, settings)),
    [candles, settings],
  )
  const [chosen, setChosen] = useState<IndicatorId | null>(null)
  if (!specs.length) return null
  if (compact) {
    const shown = specs.find((spec) => spec.id === chosen) ?? specs[0]!
    return (
      <div className="chart-indicator-stack">
        <Panel spec={shown} onEdit={onEdit} onRemove={onRemove} switcher={{ options: specs, onSelect: setChosen }} />
      </div>
    )
  }
  return (
    <div className="chart-indicator-stack">
      {specs.map((spec) => <Panel key={spec.id} spec={spec} onEdit={onEdit} onRemove={onRemove} />)}
    </div>
  )
}

/** Overlay values for the chart legend (last value of each line). */
function overlayReadings(id: IndicatorId, candles: IndicatorCandle[], settings: IndicatorSettings): Series[] {
  const { params } = settings.configs[id]
  switch (id) {
    case 'sma': return [calcSma(candles, params.period!)]
    case 'ema': return [emaOfCloses(candles, params.period!)]
    case 'bollinger': { const b = calcBollinger(candles, params.period!, params.deviation!); return [b.basis, b.upper, b.lower] }
    case 'psar': return [parabolicSar(candles, params.step!, params.max!)]
    case 'alligator': { const a = calcAlligator(candles, params); return [a.jaw, a.teeth, a.lips] }
    case 'fractal': { const f = calcFractals(candles, params.side!); return [f.up, f.down] }
    default: return []
  }
}

export function IndicatorLegend({ candles, settings, onEdit, onRemove }: {
  candles: IndicatorCandle[]
  settings: IndicatorSettings
  onEdit: (id: IndicatorId) => void
  onRemove: (id: IndicatorId) => void
}) {
  const ids = settings.enabled.filter((id) => getIndicator(id).group === 'overlay')
  if (!ids.length) return null
  return (
    <>
    {/* Phones: a single small chip instead of a list that covers the chart. */}
    <button type="button" className="chart-legend-chip" onClick={() => onEdit(ids[0]!)} aria-label={'Overlay indicators: ' + ids.length + '. Open settings'}>
      <span className="chart-legend__swatches" aria-hidden="true">
        {ids.slice(0, 3).map((id) => <i key={id} style={{ background: settings.configs[id].colors[getIndicator(id).colors[0]!.key] }} />)}
      </span>
      <span>{ids.length} {ids.length === 1 ? 'indicator' : 'indicators'}</span>
    </button>
    <ul className="chart-legend" aria-label="Active indicators">
      {ids.map((id) => {
        const config = settings.configs[id]
        const definition = getIndicator(id)
        const lines = id === 'fractal' ? [] : overlayReadings(id, candles, settings)
        return (
          <li className="chart-legend__item" key={id}>
            <span className="chart-legend__swatches" aria-hidden="true">
              {definition.colors.map((spec) => <i key={spec.key} style={{ background: config.colors[spec.key] }} />)}
            </span>
            <button type="button" className="chart-legend__name" onClick={() => onEdit(id)} title="Edit settings">{indicatorLabel(id, config)}</button>
            {lines.map((values, index) => <span className="chart-legend__value" key={index} style={{ color: config.colors[definition.colors[index]?.key ?? ''] }}>{fmt(last(values))}</span>)}
            <button type="button" className="chart-legend__icon" aria-label={'Edit ' + definition.name} title="Settings" onClick={() => onEdit(id)}><Settings2 size={12} /></button>
            <button type="button" className="chart-legend__icon" aria-label={'Remove ' + definition.name} title="Remove" onClick={() => onRemove(id)}><X size={12} /></button>
          </li>
        )
      })}
    </ul>
    </>
  )
}
