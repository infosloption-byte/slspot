import {
  AreaChart, ArrowRight, BarChart3, Check, Crosshair, Eraser, Grid2X2, LineChart, Minus, PenLine, RotateCcw, Slash, Square, TrendingUp, Volume2, VolumeX,
} from 'lucide-react'
import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Tabs } from '../ui/Tabs'
import {
  INDICATORS, clampParam, defaultConfig, getIndicator,
  type IndicatorConfig, type IndicatorId, type IndicatorSettings, type ParamSpec,
} from '../../lib/indicators'

export type ChartType = 'candles' | 'line' | 'area'
export type DrawingTool = 'none' | 'horizontal' | 'trend' | 'vertical' | 'ray' | 'fibonacci' | 'rectangle' | 'price' | 'text'
export type SettingsTab = 'chart' | 'indicators' | 'drawing'

const SWATCHES = ['#2962FF', '#FF6D00', '#FF9800', '#FFEB3B', '#26A69A', '#66BB6A', '#EF5350', '#E91E63', '#7E57C2', '#00BCD4', '#B2B5BE', '#FFFFFF']

type Props = {
  open: boolean
  onClose: () => void
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  chartType: ChartType
  onChartType: (value: ChartType) => void
  crosshair: boolean
  onCrosshair: (value: boolean) => void
  grid: boolean
  onGrid: (value: boolean) => void
  priceLine: boolean
  onPriceLine: (value: boolean) => void
  volume: boolean
  onVolume: (value: boolean) => void
  indicators: IndicatorSettings
  onIndicators: (next: IndicatorSettings) => void
  selectedIndicator: IndicatorId
  onSelectIndicator: (id: IndicatorId) => void
  drawingTool: DrawingTool
  onDrawingTool: (tool: DrawingTool) => void
  canRemoveSelectedDrawing: boolean
  drawingCount: number
  onRemoveSelectedDrawing: () => void
  onRemoveAllDrawings: () => void
  onResetChart: () => void
  timeframe: string
  timeframes: string[]
  onTimeframe: (value: string) => void
  soundEnabled: boolean
  onSound: () => void
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={checked ? 'switch switch--on' : 'switch'} onClick={() => onChange(!checked)}>
      <span />
    </button>
  )
}

function ToggleRow({ icon, title, hint, checked, onChange }: { icon: React.ReactNode; title: string; hint: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="chart-dialog__row">
      <span className="chart-dialog__row-icon" aria-hidden="true">{icon}</span>
      <span className="chart-dialog__row-copy"><strong>{title}</strong><small>{hint}</small></span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

function NumberField({ spec, value, onCommit }: { spec: ParamSpec; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null ? value : Number(draft)
  const invalid = draft !== null && (draft.trim() === '' || !Number.isFinite(parsed) || parsed < spec.min || parsed > spec.max)
  return (
    <label className="chart-field">
      <span>{spec.label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={draft ?? String(value)}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          const next = Number(event.target.value)
          if (event.target.value.trim() !== '' && Number.isFinite(next) && next >= spec.min && next <= spec.max) onCommit(clampParam(spec, next))
        }}
        onBlur={() => setDraft(null)}
      />
      {invalid ? <small className="chart-field__error">{spec.min} – {spec.max}</small> : null}
    </label>
  )
}

function IndicatorEditor({ id, config, enabled, onToggle, onChange }: {
  id: IndicatorId
  config: IndicatorConfig
  enabled: boolean
  onToggle: (value: boolean) => void
  onChange: (next: IndicatorConfig) => void
}) {
  const definition = getIndicator(id)
  return (
    <div className="chart-indicator-editor">
      <header>
        <div><h3>{definition.name}</h3><p>{definition.description}</p></div>
        <Switch checked={enabled} onChange={onToggle} label={'Show ' + definition.name} />
      </header>

      <section>
        <h4>Inputs</h4>
        <div className="chart-fields">
          {definition.params.map((spec) => (
            <NumberField key={spec.key} spec={spec} value={config.params[spec.key]!} onCommit={(value) => onChange({ ...config, params: { ...config.params, [spec.key]: value } })} />
          ))}
        </div>
      </section>

      <section>
        <h4>Style</h4>
        {definition.colors.map((spec) => (
          <div className="chart-color-row" key={spec.key}>
            <span>{spec.label}</span>
            <div className="chart-swatches" role="group" aria-label={spec.label + ' colour'}>
              {SWATCHES.map((swatch) => (
                <button
                  type="button" key={swatch} style={{ background: swatch }} aria-label={swatch}
                  className={config.colors[spec.key]?.toLowerCase() === swatch.toLowerCase() ? 'chart-swatch chart-swatch--active' : 'chart-swatch'}
                  onClick={() => onChange({ ...config, colors: { ...config.colors, [spec.key]: swatch } })}
                />
              ))}
              <input type="color" aria-label={spec.label + ' custom colour'} value={config.colors[spec.key]} onChange={(event) => onChange({ ...config, colors: { ...config.colors, [spec.key]: event.target.value.toUpperCase() } })} />
            </div>
          </div>
        ))}
        {definition.hasWidth ? (
          <div className="chart-color-row">
            <span>Line width</span>
            <div className="chart-width" role="group" aria-label="Line width">
              {[1, 2, 3, 4].map((value) => (
                <button type="button" key={value} className={config.width === value ? 'chart-width__option chart-width__option--active' : 'chart-width__option'} onClick={() => onChange({ ...config, width: value })} aria-pressed={config.width === value}>
                  <i style={{ height: value }} />{value}px
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <button type="button" className="quiet-button" onClick={() => onChange(defaultConfig(id))}><RotateCcw size={13} /> Reset to defaults</button>
    </div>
  )
}

export function ChartSettingsDialog(props: Props) {
  const { indicators, selectedIndicator } = props
  const setEnabled = (id: IndicatorId, on: boolean) => props.onIndicators({
    ...indicators,
    enabled: on ? (indicators.enabled.includes(id) ? indicators.enabled : [...indicators.enabled, id]) : indicators.enabled.filter((item) => item !== id),
  })

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Chart settings"
      description="Chart appearance, indicators and drawing tools. Changes apply instantly and are remembered."
      size="lg"
      closeLabel="Close chart settings"
      footer={(
        <>
          <button type="button" className="quiet-button" onClick={props.onResetChart}><RotateCcw size={13} /> Reset everything</button>
          <button type="button" className="btn btn--primary" onClick={props.onClose}>Done</button>
        </>
      )}
    >
      <Tabs
        className="chart-dialog__tabs"
        value={props.tab}
        onChange={props.onTabChange}
        items={[
          { id: 'chart', label: 'Chart' },
          { id: 'indicators', label: 'Indicators', count: indicators.enabled.length },
          { id: 'drawing', label: 'Drawing', count: props.drawingCount || undefined },
        ]}
      />

      {props.tab === 'chart' ? (
        <div className="chart-dialog__panel">
          <span className="chart-option-group__label">Timeframe</span>
          <div className="chart-timeframe-grid" role="group" aria-label="Chart timeframe">
            {props.timeframes.map((value) => (
              <button key={value} type="button" className={props.timeframe === value ? 'timeframe timeframe--active' : 'timeframe'} aria-pressed={props.timeframe === value} onClick={() => props.onTimeframe(value)}>{value}</button>
            ))}
          </div>
          <span className="chart-option-group__label">Chart type</span>
          <div className="chart-type-switch">
            {([['candles', 'Candles', TrendingUp], ['line', 'Line', LineChart], ['area', 'Area', AreaChart]] as const).map(([value, label, Icon]) => (
              <button key={value} type="button" className={props.chartType === value ? 'chart-type chart-type--active' : 'chart-type'} onClick={() => props.onChartType(value)} aria-pressed={props.chartType === value}>
                <Icon size={16} /><span>{label}</span>
              </button>
            ))}
          </div>
          <div className="chart-dialog__rows">
            <ToggleRow icon={<Crosshair size={16} />} title="Crosshair" hint="Follow the cursor with price and time guides" checked={props.crosshair} onChange={props.onCrosshair} />
            <ToggleRow icon={<Grid2X2 size={16} />} title="Grid" hint="Show guide lines behind the candles" checked={props.grid} onChange={props.onGrid} />
            <ToggleRow icon={<span className="chart-option__line-icon" />} title="Last price" hint="Show the current-price line and tag" checked={props.priceLine} onChange={props.onPriceLine} />
            <ToggleRow icon={<BarChart3 size={16} />} title="Volume" hint="Volume histogram under the price" checked={props.volume} onChange={props.onVolume} />
            <ToggleRow icon={props.soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />} title="Trade sounds" hint="Play a sound when a trade opens or settles" checked={props.soundEnabled} onChange={props.onSound} />
          </div>
        </div>
      ) : null}

      {props.tab === 'indicators' ? (
        <div className="chart-indicators-layout">
          <nav className="chart-indicator-list" aria-label="Indicators">
            {(['overlay', 'oscillator'] as const).map((group) => (
              <div key={group}>
                <span className="chart-option-group__label">{group === 'overlay' ? 'On the price chart' : 'Separate panel'}</span>
                {INDICATORS.filter((item) => item.group === group).map((item) => {
                  const on = indicators.enabled.includes(item.id)
                  return (
                    <div key={item.id} className={'chart-indicator-item' + (selectedIndicator === item.id ? ' chart-indicator-item--selected' : '')}>
                      <button type="button" className="chart-indicator-item__main" onClick={() => props.onSelectIndicator(item.id)} aria-current={selectedIndicator === item.id || undefined}>
                        <span className="chart-indicator-item__swatch" style={{ background: indicators.configs[item.id].colors[item.colors[0]!.key] }} aria-hidden="true" />
                        <span><strong>{item.name}</strong><small>{item.description}</small></span>
                      </button>
                      <button type="button" role="checkbox" aria-checked={on} aria-label={(on ? 'Hide ' : 'Show ') + item.name} className={on ? 'chart-option__check chart-option__check--active' : 'chart-option__check'} onClick={() => setEnabled(item.id, !on)}>
                        {on ? <Check size={12} /> : null}
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </nav>
          <IndicatorEditor
            id={selectedIndicator}
            config={indicators.configs[selectedIndicator]}
            enabled={indicators.enabled.includes(selectedIndicator)}
            onToggle={(value) => setEnabled(selectedIndicator, value)}
            onChange={(next) => props.onIndicators({ ...indicators, configs: { ...indicators.configs, [selectedIndicator]: next } })}
          />
        </div>
      ) : null}

      {props.tab === 'drawing' ? (
        <div className="chart-dialog__panel">
          <span className="chart-option-group__label">Pick a tool, then click the chart</span>
          <div className="drawing-tools">
            {([
              ['horizontal', 'Horizontal line', Minus], ['trend', 'Trend line', Slash], ['vertical', 'Vertical line', Minus],
              ['ray', 'Ray', ArrowRight], ['fibonacci', 'Fibonacci', TrendingUp], ['rectangle', 'Rectangle', Square],
              ['price', 'Price marker', PenLine], ['text', 'Text note', PenLine],
            ] as const).map(([value, label, Icon]) => (
              <button type="button" key={value} className={props.drawingTool === value ? 'drawing-tool drawing-tool--active' : 'drawing-tool'} onClick={() => { props.onDrawingTool(value); props.onClose() }}><Icon size={14} /> {label}</button>
            ))}
          </div>
          <div className="chart-dialog__actions">
            <button type="button" className="quiet-button" disabled={!props.canRemoveSelectedDrawing} onClick={props.onRemoveSelectedDrawing}><Eraser size={13} /> Remove selected</button>
            <button type="button" className="quiet-button" disabled={!props.drawingCount} onClick={props.onRemoveAllDrawings}><Eraser size={13} /> Remove all ({props.drawingCount})</button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
