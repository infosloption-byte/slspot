import assert from 'node:assert/strict'
import test from 'node:test'
import { countPrepended, formatChartCrosshairTime, formatChartTick, tickKind } from './chartTime'
import { formatDateTime, isValidTimeZone, setDisplayTimeZone, getDisplayTimeZone } from './dateTime'

// 2026-10-09T00:30:00Z
const instant = Date.UTC(2026, 9, 9, 0, 30) / 1000

test('chart ticks follow the requested timezone, not UTC', () => {
  assert.equal(formatChartTick(instant, 3, 'en-US', 'UTC'), '00:30')
  assert.equal(formatChartTick(instant, 3, 'en-US', 'Asia/Colombo'), '06:00')
  assert.equal(formatChartTick(instant, 3, 'en-US', 'America/New_York'), '20:30')
})

test('day ticks show a date and the day rolls over per timezone', () => {
  assert.equal(formatChartTick(instant, 2, 'en-US', 'UTC'), 'Oct 9')
  assert.equal(formatChartTick(instant, 2, 'en-US', 'America/New_York'), 'Oct 8')
})

test('tick kinds accept numeric enum values and member names', () => {
  assert.equal(tickKind(0), 'year')
  assert.equal(tickKind(1), 'month')
  assert.equal(tickKind(2), 'day')
  assert.equal(tickKind(3), 'time')
  assert.equal(tickKind(4), 'seconds')
  assert.equal(tickKind('DayOfMonth'), 'day')
})

test('crosshair label uses the timezone and handles business-day times', () => {
  assert.match(formatChartCrosshairTime(instant, 'Asia/Colombo'), /06:00/)
  assert.match(formatChartCrosshairTime(instant, 'UTC'), /00:30/)
  assert.ok(formatChartCrosshairTime({ year: 2026, month: 10, day: 9 }, 'UTC').length > 0)
})

test('countPrepended counts only candles older than the previous first candle', () => {
  assert.equal(countPrepended(100, [60, 70, 80, 100, 110, 120]), 3)
  assert.equal(countPrepended(100, [100, 110, 120, 130]), 0)
  assert.equal(countPrepended(null, [1, 2, 3]), 0)
  assert.equal(countPrepended(100, [100, 110, 120]), 0)
})

test('display timezone ignores invalid values and formats in the profile zone', () => {
  assert.equal(isValidTimeZone('Asia/Colombo'), true)
  assert.equal(isValidTimeZone('Not/AZone'), false)
  assert.equal(isValidTimeZone(''), false)
  setDisplayTimeZone('Not/AZone')
  assert.equal(getDisplayTimeZone(), undefined)
  setDisplayTimeZone('Asia/Colombo')
  assert.equal(getDisplayTimeZone(), 'Asia/Colombo')
  assert.match(formatDateTime('2026-10-09T00:30:00Z'), /6:00/)
  assert.match(formatDateTime('2026-10-09T00:30:00Z', { timeZone: 'UTC' }), /12:30/)
  assert.equal(formatDateTime('nonsense'), 'nonsense')
  assert.equal(formatDateTime(null), '—')
  setDisplayTimeZone(null)
  assert.equal(getDisplayTimeZone(), undefined)
})
