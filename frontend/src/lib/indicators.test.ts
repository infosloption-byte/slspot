import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  INDICATORS, alligator, atr, awesomeOscillator, bollinger, defaultConfig, defaultIndicatorSettings, emaOfCloses,
  fractals, indicatorLabel, macd, parabolicSar, rsi, sanitizeIndicatorSettings, shiftForward, sma, stochastic, toPoints,
  type IndicatorCandle,
} from './indicators'

const make = (closes: number[]): IndicatorCandle[] => closes.map((close, index) => ({
  time: index * 60, open: close, high: close + 1, low: close - 1, close,
}))
const rising = make(Array.from({ length: 60 }, (_, index) => 100 + index))

describe('moving averages', () => {
  it('sma leaves the warm-up empty and averages the window', () => {
    assert.deepEqual(sma(make([1, 2, 3, 4, 5]), 3), [null, null, 2, 3, 4])
  })

  it('ema seeds with the simple average then smooths', () => {
    const result = emaOfCloses(make([1, 2, 3, 4, 5]), 3)
    assert.deepEqual(result.slice(0, 2), [null, null])
    assert.equal(result[2], 2)
    assert.equal(result[3], 3)
    assert.equal(result[4], 4)
  })
})

describe('oscillators', () => {
  it('rsi is 100 for an uninterrupted rise and respects the warm-up', () => {
    const result = rsi(rising, 14)
    assert.equal(result[13], null)
    assert.equal(result[14], 100)
    assert.ok(result.every((value) => value === null || (value >= 0 && value <= 100)))
  })

  it('rsi falls below 50 in a falling market', () => {
    const falling = make(Array.from({ length: 40 }, (_, index) => 200 - index))
    assert.ok((rsi(falling, 14).at(-1) ?? 100) < 5)
  })

  it('macd histogram is the difference of macd and signal', () => {
    const result = macd(rising, 12, 26, 9)
    const last = rising.length - 1
    assert.ok(Math.abs((result.macd[last]! - result.signal[last]!) - result.histogram[last]!) < 1e-9)
    assert.equal(result.macd[24], null)
    assert.notEqual(result.macd[25], null)
  })

  it('stochastic reads 100 when the close is at the top of the range', () => {
    const candles: IndicatorCandle[] = Array.from({ length: 20 }, (_, index) => ({ time: index, open: index, high: index, low: index - 5, close: index }))
    const result = stochastic(candles, 14, 1, 1)
    assert.equal(result.k.at(-1), 100)
    assert.equal(result.k[12], null)
  })

  it('stochastic smoothing delays the first value', () => {
    const result = stochastic(rising, 14, 3, 3)
    assert.equal(result.k[14], null)
    assert.notEqual(result.k[15], null)
    assert.equal(result.d[16], null)
    assert.notEqual(result.d[17], null)
  })

  it('atr of constant two-point ranges is two', () => {
    const result = atr(make(new Array(30).fill(100)), 14)
    assert.equal(result[12], null)
    assert.equal(result[29], 2)
  })

  it('awesome oscillator is positive in an uptrend', () => {
    assert.ok((awesomeOscillator(rising, 5, 34).at(-1) ?? 0) > 0)
  })
})

describe('bands and overlays', () => {
  it('bollinger bands collapse onto the mean for a flat market and widen with the multiplier', () => {
    const flat = bollinger(make(new Array(30).fill(10)), 20, 2)
    assert.equal(flat.upper.at(-1), 10)
    const wide = bollinger(rising, 20, 3)
    const narrow = bollinger(rising, 20, 1)
    assert.ok(wide.upper.at(-1)! - wide.basis.at(-1)! > narrow.upper.at(-1)! - narrow.basis.at(-1)!)
  })

  it('parabolic sar trails below a rising market', () => {
    const result = parabolicSar(rising, 0.02, 0.2)
    assert.equal(result[0], null)
    assert.ok(result.at(-1)! < rising.at(-1)!.low)
  })

  it('fractals mark local swing highs and lows', () => {
    const closes = [1, 2, 3, 2, 1, 2, 3, 2, 1].map((value) => value * 10)
    const result = fractals(make(closes), 2)
    assert.equal(result.up[2]! > 0, true)
    assert.equal(result.down[4]! > 0, true)
    assert.equal(result.up[0], null)
  })

  it('shiftForward moves values later and drops the overflow', () => {
    assert.deepEqual(shiftForward([1, 2, 3, 4], 2), [null, null, 1, 2])
    assert.deepEqual(shiftForward([1, 2], 0), [1, 2])
  })

  it('alligator applies each line offset', () => {
    const result = alligator(rising, defaultConfig('alligator').params)
    assert.equal(result.jaw[13 + 8 - 2], null)
    assert.notEqual(result.jaw[13 + 8 - 1], null)
  })

  it('toPoints skips warm-up gaps', () => {
    assert.deepEqual(toPoints(make([1, 2, 3]), [null, 5, 6]), [{ time: 60, value: 5 }, { time: 120, value: 6 }])
  })
})

describe('settings', () => {
  it('ships standard colours and sensible defaults for every indicator', () => {
    for (const definition of INDICATORS) {
      for (const spec of definition.colors) assert.match(definition.defaults.colors[spec.key]!, /^#[0-9A-F]{6}$/i)
      for (const spec of definition.params) assert.ok(definition.defaults.params[spec.key]! >= spec.min && definition.defaults.params[spec.key]! <= spec.max)
    }
    assert.equal(defaultConfig('rsi').colors.line, '#7E57C2')
    assert.equal(defaultConfig('macd').colors.macd, '#2962FF')
    assert.equal(defaultConfig('macd').colors.signal, '#FF6D00')
  })

  it('sanitizes stored settings: clamps numbers, rejects bad colours, drops unknown ids', () => {
    const result = sanitizeIndicatorSettings({
      enabled: ['sma', 'nope', 'rsi'],
      configs: {
        sma: { params: { period: 9999 }, colors: { line: 'javascript:alert(1)' }, width: 99 },
        macd: { params: { fast: 40, slow: 26, signal: 9 }, colors: { macd: '#00ff00' } },
        rsi: { params: { overbought: 40, oversold: 60 } },
      },
    })
    assert.deepEqual(result.enabled, ['sma', 'rsi'])
    assert.equal(result.configs.sma.params.period, 500)
    assert.equal(result.configs.sma.colors.line, '#2962FF')
    assert.equal(result.configs.sma.width, 4)
    assert.equal(result.configs.macd.colors.macd, '#00ff00')
    assert.ok(result.configs.macd.params.fast! < result.configs.macd.params.slow!)
    assert.ok(result.configs.rsi.params.oversold! < result.configs.rsi.params.overbought!)
  })

  it('falls back to defaults for garbage input', () => {
    assert.deepEqual(sanitizeIndicatorSettings('x'), defaultIndicatorSettings())
    assert.deepEqual(sanitizeIndicatorSettings(null), defaultIndicatorSettings())
  })

  it('labels show the active parameters', () => {
    const config = defaultConfig('macd')
    config.params.fast = 8
    assert.equal(indicatorLabel('macd', config), 'MACD 8 26 9')
    assert.equal(indicatorLabel('sma', defaultConfig('sma')), 'SMA 14')
  })
})
