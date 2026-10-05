/**
 * Technical indicators: pure maths, parameter schemas and the standard colours.
 *
 * Every calculation returns an array aligned with the input candles. Positions where the
 * indicator is not defined yet (the warm-up window) are `null`, so nothing is drawn there
 * instead of a misleading partial value.
 */

export type IndicatorCandle = { time: number; open: number; high: number; low: number; close: number }
export type Series = Array<number | null>

/** Height in pixels of one oscillator panel under the chart. */
export const OSCILLATOR_PANEL_HEIGHT = 84

export type IndicatorId = 'sma' | 'ema' | 'bollinger' | 'psar' | 'alligator' | 'fractal' | 'rsi' | 'macd' | 'stochastic' | 'atr' | 'ao'

export type ParamSpec = { key: string; label: string; min: number; max: number; step: number; integer?: boolean }
export type ColorSpec = { key: string; label: string }

export type IndicatorDefinition = {
  id: IndicatorId
  name: string
  description: string
  group: 'overlay' | 'oscillator'
  params: ParamSpec[]
  colors: ColorSpec[]
  /** Whether the style tab offers a line width. */
  hasWidth: boolean
  defaults: { params: Record<string, number>; colors: Record<string, string>; width: number }
}

// Standard palette used by the major charting platforms.
const BLUE = '#2962FF'
const ORANGE = '#FF6D00'
const AMBER = '#FF9800'
const PURPLE = '#7E57C2'
const GREEN = '#26A69A'
const RED = '#EF5350'
const DARK_RED = '#B71C1C'
const PINK = '#E91E63'
const LIME = '#66BB6A'

const period = (key = 'period', label = 'Period', min = 1, max = 500): ParamSpec => ({ key, label, min, max, step: 1, integer: true })

export const INDICATORS: IndicatorDefinition[] = [
  {
    id: 'sma', name: 'SMA', description: 'Simple moving average', group: 'overlay', hasWidth: true,
    params: [period()], colors: [{ key: 'line', label: 'Line' }],
    defaults: { params: { period: 14 }, colors: { line: BLUE }, width: 2 },
  },
  {
    id: 'ema', name: 'EMA', description: 'Exponential moving average', group: 'overlay', hasWidth: true,
    params: [period()], colors: [{ key: 'line', label: 'Line' }],
    defaults: { params: { period: 14 }, colors: { line: AMBER }, width: 2 },
  },
  {
    id: 'bollinger', name: 'Bollinger Bands', description: 'Volatility envelope', group: 'overlay', hasWidth: true,
    params: [period('period', 'Period', 2, 500), { key: 'deviation', label: 'Std. deviation', min: 0.1, max: 10, step: 0.1 }],
    colors: [{ key: 'basis', label: 'Basis' }, { key: 'upper', label: 'Upper band' }, { key: 'lower', label: 'Lower band' }],
    defaults: { params: { period: 20, deviation: 2 }, colors: { basis: ORANGE, upper: BLUE, lower: BLUE }, width: 1 },
  },
  {
    id: 'psar', name: 'Parabolic SAR', description: 'Trend reversal guide', group: 'overlay', hasWidth: false,
    params: [{ key: 'step', label: 'Step', min: 0.001, max: 1, step: 0.001 }, { key: 'max', label: 'Max step', min: 0.01, max: 1, step: 0.01 }],
    colors: [{ key: 'dots', label: 'Dots' }],
    defaults: { params: { step: 0.02, max: 0.2 }, colors: { dots: BLUE }, width: 1 },
  },
  {
    id: 'alligator', name: 'Alligator', description: 'Three smoothed trend lines', group: 'overlay', hasWidth: true,
    params: [
      period('jawPeriod', 'Jaw length'), period('jawShift', 'Jaw offset', 0, 100),
      period('teethPeriod', 'Teeth length'), period('teethShift', 'Teeth offset', 0, 100),
      period('lipsPeriod', 'Lips length'), period('lipsShift', 'Lips offset', 0, 100),
    ],
    colors: [{ key: 'jaw', label: 'Jaw' }, { key: 'teeth', label: 'Teeth' }, { key: 'lips', label: 'Lips' }],
    defaults: {
      params: { jawPeriod: 13, jawShift: 8, teethPeriod: 8, teethShift: 5, lipsPeriod: 5, lipsShift: 3 },
      colors: { jaw: BLUE, teeth: PINK, lips: LIME },
      width: 1,
    },
  },
  {
    id: 'fractal', name: 'Fractals', description: 'Swing high and low markers', group: 'overlay', hasWidth: false,
    params: [period('side', 'Bars each side', 1, 20)],
    colors: [{ key: 'up', label: 'Up fractal' }, { key: 'down', label: 'Down fractal' }],
    defaults: { params: { side: 2 }, colors: { up: GREEN, down: RED }, width: 1 },
  },
  {
    id: 'rsi', name: 'RSI', description: 'Relative strength index', group: 'oscillator', hasWidth: true,
    params: [period(), { key: 'overbought', label: 'Overbought', min: 50, max: 100, step: 1, integer: true }, { key: 'oversold', label: 'Oversold', min: 0, max: 50, step: 1, integer: true }],
    colors: [{ key: 'line', label: 'RSI' }],
    defaults: { params: { period: 14, overbought: 70, oversold: 30 }, colors: { line: PURPLE }, width: 2 },
  },
  {
    id: 'macd', name: 'MACD', description: 'Trend and momentum', group: 'oscillator', hasWidth: true,
    params: [period('fast', 'Fast length'), period('slow', 'Slow length'), period('signal', 'Signal length')],
    colors: [{ key: 'macd', label: 'MACD' }, { key: 'signal', label: 'Signal' }, { key: 'up', label: 'Histogram up' }, { key: 'down', label: 'Histogram down' }],
    defaults: { params: { fast: 12, slow: 26, signal: 9 }, colors: { macd: BLUE, signal: ORANGE, up: GREEN, down: RED }, width: 2 },
  },
  {
    id: 'stochastic', name: 'Stochastic', description: 'Momentum oscillator', group: 'oscillator', hasWidth: true,
    params: [period('k', '%K length'), period('smooth', '%K smoothing'), period('d', '%D smoothing'), { key: 'overbought', label: 'Overbought', min: 50, max: 100, step: 1, integer: true }, { key: 'oversold', label: 'Oversold', min: 0, max: 50, step: 1, integer: true }],
    colors: [{ key: 'k', label: '%K' }, { key: 'd', label: '%D' }],
    defaults: { params: { k: 14, smooth: 3, d: 3, overbought: 80, oversold: 20 }, colors: { k: BLUE, d: ORANGE }, width: 2 },
  },
  {
    id: 'atr', name: 'ATR', description: 'Average true range', group: 'oscillator', hasWidth: true,
    params: [period()], colors: [{ key: 'line', label: 'ATR' }],
    defaults: { params: { period: 14 }, colors: { line: DARK_RED }, width: 2 },
  },
  {
    id: 'ao', name: 'Awesome Oscillator', description: 'Momentum oscillator', group: 'oscillator', hasWidth: false,
    params: [period('fast', 'Fast length'), period('slow', 'Slow length')],
    colors: [{ key: 'up', label: 'Rising' }, { key: 'down', label: 'Falling' }],
    defaults: { params: { fast: 5, slow: 34 }, colors: { up: GREEN, down: RED }, width: 1 },
  },
]

export function getIndicator(id: IndicatorId): IndicatorDefinition {
  return INDICATORS.find((item) => item.id === id)!
}

// ---------------------------------------------------------------------------
// Settings state
// ---------------------------------------------------------------------------

export type IndicatorConfig = { params: Record<string, number>; colors: Record<string, string>; width: number }
export type IndicatorSettings = { enabled: IndicatorId[]; configs: Record<IndicatorId, IndicatorConfig> }

export function defaultConfig(id: IndicatorId): IndicatorConfig {
  const { defaults } = getIndicator(id)
  return { params: { ...defaults.params }, colors: { ...defaults.colors }, width: defaults.width }
}

export function defaultIndicatorSettings(): IndicatorSettings {
  return {
    enabled: ['sma'],
    configs: Object.fromEntries(INDICATORS.map((item) => [item.id, defaultConfig(item.id)])) as Record<IndicatorId, IndicatorConfig>,
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function clampParam(spec: ParamSpec, value: number): number {
  const base = Number.isFinite(value) ? value : Number.NaN
  if (Number.isNaN(base)) return NaN
  const clamped = Math.min(spec.max, Math.max(spec.min, base))
  return spec.integer ? Math.round(clamped) : Math.round(clamped * 1e6) / 1e6
}

/** Rebuilds trusted settings from anything read back from storage. */
export function sanitizeIndicatorSettings(raw: unknown): IndicatorSettings {
  const result = defaultIndicatorSettings()
  if (!raw || typeof raw !== 'object') return result
  const input = raw as { enabled?: unknown; configs?: Record<string, { params?: Record<string, unknown>; colors?: Record<string, unknown>; width?: unknown }> }

  if (Array.isArray(input.enabled)) {
    result.enabled = input.enabled.filter((id): id is IndicatorId => INDICATORS.some((item) => item.id === id))
  }

  for (const definition of INDICATORS) {
    const stored = input.configs?.[definition.id]
    if (!stored || typeof stored !== 'object') continue
    const config = result.configs[definition.id]
    for (const spec of definition.params) {
      const value = clampParam(spec, Number(stored.params?.[spec.key]))
      if (!Number.isNaN(value)) config.params[spec.key] = value
    }
    for (const spec of definition.colors) {
      const value = stored.colors?.[spec.key]
      if (typeof value === 'string' && HEX.test(value)) config.colors[spec.key] = value
    }
    const width = Number(stored.width)
    if (Number.isFinite(width)) config.width = Math.min(4, Math.max(1, Math.round(width)))
  }

  // Keep relationships valid: the fast length must stay below the slow one.
  for (const id of ['macd', 'ao'] as const) {
    const { params } = result.configs[id]
    if (params.fast! >= params.slow!) params.fast = Math.max(1, params.slow! - 1)
  }
  for (const id of ['rsi', 'stochastic'] as const) {
    const { params } = result.configs[id]
    if (params.oversold! >= params.overbought!) {
      params.oversold = getIndicator(id).defaults.params.oversold!
      params.overbought = getIndicator(id).defaults.params.overbought!
    }
  }
  return result
}

/** Short label such as "EMA 14" or "MACD 12 26 9" shown on the chart legend. */
export function indicatorLabel(id: IndicatorId, config: IndicatorConfig): string {
  const definition = getIndicator(id)
  const shown: Record<IndicatorId, string[]> = {
    sma: ['period'], ema: ['period'], bollinger: ['period', 'deviation'], psar: ['step', 'max'],
    alligator: ['jawPeriod', 'teethPeriod', 'lipsPeriod'], fractal: ['side'], rsi: ['period'],
    macd: ['fast', 'slow', 'signal'], stochastic: ['k', 'smooth', 'd'], atr: ['period'], ao: ['fast', 'slow'],
  }
  return [definition.name, ...shown[id].map((key) => String(config.params[key]))].join(' ')
}

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

function windowMean(values: number[], length: number): Series {
  const out: Series = []
  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]!
    if (index >= length) sum -= values[index - length]!
    out.push(index >= length - 1 ? sum / length : null)
  }
  return out
}

export function sma(candles: IndicatorCandle[], length: number): Series {
  return windowMean(candles.map((candle) => candle.close), length)
}

export function ema(values: Array<number | null>, length: number): Series {
  const multiplier = 2 / (length + 1)
  const out: Series = []
  let previous: number | null = null
  let seed: number[] = []
  for (const value of values) {
    if (value === null) { out.push(null); continue }
    if (previous === null) {
      seed.push(value)
      if (seed.length < length) { out.push(null); continue }
      previous = seed.reduce((sum, item) => sum + item, 0) / length
      seed = []
    } else {
      previous = (value - previous) * multiplier + previous
    }
    out.push(previous)
  }
  return out
}

export const emaOfCloses = (candles: IndicatorCandle[], length: number): Series => ema(candles.map((candle) => candle.close), length)

/** Wilder's smoothing (RMA), used by RSI and ATR. */
function rma(values: number[], length: number, startIndex = 0): Series {
  const out: Series = new Array(values.length).fill(null)
  let previous: number | null = null
  for (let index = startIndex; index < values.length; index += 1) {
    if (previous === null) {
      if (index - startIndex + 1 < length) continue
      let sum = 0
      for (let cursor = index - length + 1; cursor <= index; cursor += 1) sum += values[cursor]!
      previous = sum / length
    } else {
      previous = (previous * (length - 1) + values[index]!) / length
    }
    out[index] = previous
  }
  return out
}

export function rsi(candles: IndicatorCandle[], length: number): Series {
  const gains = [0]
  const losses = [0]
  for (let index = 1; index < candles.length; index += 1) {
    const change = candles[index]!.close - candles[index - 1]!.close
    gains.push(Math.max(change, 0))
    losses.push(Math.max(-change, 0))
  }
  const avgGain = rma(gains, length, 1)
  const avgLoss = rma(losses, length, 1)
  return avgGain.map((gain, index) => {
    const loss = avgLoss[index]
    if (gain === null || loss === null || loss === undefined) return null
    if (loss === 0) return gain === 0 ? 50 : 100
    return 100 - 100 / (1 + gain / loss)
  })
}

export function bollinger(candles: IndicatorCandle[], length: number, deviation: number): { basis: Series; upper: Series; lower: Series } {
  const closes = candles.map((candle) => candle.close)
  const basis = windowMean(closes, length)
  const upper: Series = []
  const lower: Series = []
  basis.forEach((mean, index) => {
    if (mean === null) { upper.push(null); lower.push(null); return }
    let variance = 0
    for (let cursor = index - length + 1; cursor <= index; cursor += 1) variance += (closes[cursor]! - mean) ** 2
    const spread = Math.sqrt(variance / length) * deviation
    upper.push(mean + spread)
    lower.push(mean - spread)
  })
  return { basis, upper, lower }
}

export function stochastic(candles: IndicatorCandle[], kLength: number, smooth: number, dLength: number): { k: Series; d: Series } {
  const raw: number[] = candles.map((candle, index) => {
    if (index < kLength - 1) return Number.NaN
    let highest = -Infinity
    let lowest = Infinity
    for (let cursor = index - kLength + 1; cursor <= index; cursor += 1) {
      highest = Math.max(highest, candles[cursor]!.high)
      lowest = Math.min(lowest, candles[cursor]!.low)
    }
    return highest === lowest ? 50 : ((candle.close - lowest) / (highest - lowest)) * 100
  })
  const smoothMean = (values: Array<number | null>, length: number): Series => values.map((_, index) => {
    if (length <= 1) return values[index] ?? null
    if (index < length - 1) return null
    let sum = 0
    for (let cursor = index - length + 1; cursor <= index; cursor += 1) {
      const value = values[cursor]
      if (value === null || value === undefined) return null
      sum += value
    }
    return sum / length
  })
  const rawSeries: Series = raw.map((value) => (Number.isNaN(value) ? null : value))
  const k = smoothMean(rawSeries, smooth)
  return { k, d: smoothMean(k, dLength) }
}

export function atr(candles: IndicatorCandle[], length: number): Series {
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low
    const previousClose = candles[index - 1]!.close
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose))
  })
  return rma(ranges, length)
}

export function macd(candles: IndicatorCandle[], fast: number, slow: number, signalLength: number): { macd: Series; signal: Series; histogram: Series } {
  const fastEma = emaOfCloses(candles, fast)
  const slowEma = emaOfCloses(candles, slow)
  const line: Series = fastEma.map((value, index) => {
    const other = slowEma[index]
    return value === null || other === null || other === undefined ? null : value - other
  })
  const signal = ema(line, signalLength)
  const histogram: Series = line.map((value, index) => {
    const s = signal[index]
    return value === null || s === null || s === undefined ? null : value - s
  })
  return { macd: line, signal, histogram }
}

export function awesomeOscillator(candles: IndicatorCandle[], fast: number, slow: number): Series {
  const median = candles.map((candle) => (candle.high + candle.low) / 2)
  const short = windowMean(median, fast)
  const long = windowMean(median, slow)
  return short.map((value, index) => {
    const other = long[index]
    return value === null || other === null || other === undefined ? null : value - other
  })
}

export function parabolicSar(candles: IndicatorCandle[], step: number, maxStep: number): Series {
  if (candles.length < 2) return candles.map(() => null)
  let rising = candles[1]!.close >= candles[0]!.close
  let sar = rising ? candles[0]!.low : candles[0]!.high
  let extreme = rising ? candles[0]!.high : candles[0]!.low
  let acceleration = step
  const out: Series = [null]

  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index]!
    const previous = candles[index - 1]!
    const candidate = sar + acceleration * (extreme - sar)

    if (rising) {
      if (candle.low < candidate) {
        rising = false
        sar = extreme
        extreme = candle.low
        acceleration = step
      } else {
        sar = Math.min(candidate, previous.low, candles[index - 2]?.low ?? previous.low)
        if (candle.high > extreme) {
          extreme = candle.high
          acceleration = Math.min(maxStep, acceleration + step)
        }
      }
    } else if (candle.high > candidate) {
      rising = true
      sar = extreme
      extreme = candle.high
      acceleration = step
    } else {
      sar = Math.max(candidate, previous.high, candles[index - 2]?.high ?? previous.high)
      if (candle.low < extreme) {
        extreme = candle.low
        acceleration = Math.min(maxStep, acceleration + step)
      }
    }
    out.push(sar)
  }
  return out
}

/** Smoothed moving average (Wilder) of the bar median, as used by Bill Williams' Alligator. */
function smma(values: number[], length: number): Series {
  const out: Series = new Array(values.length).fill(null)
  let previous: number | null = null
  for (let index = 0; index < values.length; index += 1) {
    if (previous === null) {
      if (index < length - 1) continue
      let sum = 0
      for (let cursor = index - length + 1; cursor <= index; cursor += 1) sum += values[cursor]!
      previous = sum / length
    } else {
      previous = (previous * (length - 1) + values[index]!) / length
    }
    out[index] = previous
  }
  return out
}

/** Moves a series forward by `offset` bars; values pushed past the last candle are dropped. */
export function shiftForward(values: Series, offset: number): Series {
  if (offset <= 0) return values
  return values.map((_, index) => (index - offset >= 0 ? values[index - offset]! : null))
}

export function alligator(candles: IndicatorCandle[], config: Record<string, number>): { jaw: Series; teeth: Series; lips: Series } {
  const median = candles.map((candle) => (candle.high + candle.low) / 2)
  return {
    jaw: shiftForward(smma(median, config.jawPeriod!), config.jawShift!),
    teeth: shiftForward(smma(median, config.teethPeriod!), config.teethShift!),
    lips: shiftForward(smma(median, config.lipsPeriod!), config.lipsShift!),
  }
}

export function fractals(candles: IndicatorCandle[], side: number): { up: Series; down: Series } {
  const up: Series = new Array(candles.length).fill(null)
  const down: Series = new Array(candles.length).fill(null)
  for (let index = side; index < candles.length - side; index += 1) {
    const current = candles[index]!
    let isHigh = true
    let isLow = true
    for (let cursor = index - side; cursor <= index + side; cursor += 1) {
      if (cursor === index) continue
      if (candles[cursor]!.high >= current.high) isHigh = false
      if (candles[cursor]!.low <= current.low) isLow = false
    }
    if (isHigh) up[index] = current.high
    if (isLow) down[index] = current.low
  }
  return { up, down }
}

/** Drops warm-up gaps so a series can be handed to the chart as line data. */
export function toPoints(candles: IndicatorCandle[], values: Series): Array<{ time: number; value: number }> {
  const points: Array<{ time: number; value: number }> = []
  values.forEach((value, index) => {
    if (value !== null && Number.isFinite(value)) points.push({ time: candles[index]!.time, value })
  })
  return points
}
