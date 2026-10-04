import assert from 'node:assert/strict'
import test from 'node:test'
import { DemoPriceSimulator, secureRandom } from './demoPrice.js'

function sequence(values: number[]) {
  let index = 0
  return () => values[index++ % values.length]!
}

test('secureRandom returns floats in [0, 1)', () => {
  for (let i = 0; i < 500; i += 1) {
    const value = secureRandom()
    assert.ok(value >= 0 && value < 1)
  }
})

test('first quote is the anchor and quotes inside one instant are identical', () => {
  let clock = 1_000_000
  const sim = new DemoPriceSimulator({ now: () => clock, random: sequence([0.3, 0.6]) })
  assert.equal(sim.quote('BTC/USD', 68_000), 68_000)
  clock += 100
  assert.equal(sim.quote('BTC/USD', 68_000), 68_000)
})

test('price is not a function of the clock alone (the old sine formula was)', () => {
  const run = () => {
    let clock = 0
    const sim = new DemoPriceSimulator({ now: () => clock })
    sim.quote('ETH/USD', 2_500)
    const prices: number[] = []
    for (let i = 0; i < 20; i += 1) {
      clock += 5_000
      prices.push(sim.quote('ETH/USD', 2_500))
    }
    return prices
  }
  // Same timestamps, independent secure randomness: the two runs must differ.
  assert.notDeepEqual(run(), run())
})

test('successive moves are driven by the random source, up and down', () => {
  let clock = 0
  const up = new DemoPriceSimulator({ now: () => clock, random: sequence([0.5, 0.0001]) }) // cos(~0) > 0
  const down = new DemoPriceSimulator({ now: () => clock, random: sequence([0.5, 0.5]) }) // cos(pi) < 0
  up.quote('XRP/USD', 2.4)
  down.quote('XRP/USD', 2.4)
  clock += 10_000
  assert.ok(up.quote('XRP/USD', 2.4) > 2.4)
  assert.ok(down.quote('XRP/USD', 2.4) < 2.4)
})

test('price stays within the configured band around the anchor', () => {
  let clock = 0
  const sim = new DemoPriceSimulator({ now: () => clock, random: sequence([0.5, 0.0001]), sigmaPerSqrtSecond: 0.05 })
  sim.quote('SOL/USD', 150)
  for (let i = 0; i < 200; i += 1) {
    clock += 30_000
    const price = sim.quote('SOL/USD', 150)
    assert.ok(price <= 150 * 1.05 + 1e-9 && price >= 150 * 0.95 - 1e-9, String(price))
  }
})

test('a new anchor restarts the walk and symbols are independent', () => {
  let clock = 0
  const sim = new DemoPriceSimulator({ now: () => clock })
  assert.equal(sim.quote('EUR/USD', 1.17), 1.17)
  assert.equal(sim.quote('GBP/USD', 1.35), 1.35)
  clock += 5_000
  assert.equal(sim.quote('EUR/USD', 1.2), 1.2)
  assert.throws(() => sim.quote('EUR/USD', 0), RangeError)
  assert.throws(() => sim.quote('EUR/USD', Number.NaN), RangeError)
})
