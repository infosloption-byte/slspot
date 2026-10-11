import test from 'node:test'
import assert from 'node:assert/strict'
import { isTimeZoneForCountry } from './countryTimeZones.js'

test('accepts a time zone associated with the selected country', () => {
  assert.equal(isTimeZoneForCountry('LK', 'Asia/Colombo'), true)
  assert.equal(isTimeZoneForCountry('US', 'America/Los_Angeles'), true)
  assert.equal(isTimeZoneForCountry('CA', 'America/Toronto'), true)
})

test('rejects missing or mismatched country/time-zone pairs', () => {
  assert.equal(isTimeZoneForCountry('LK', 'America/New_York'), false)
  assert.equal(isTimeZoneForCountry('US', 'Asia/Colombo'), false)
  assert.equal(isTimeZoneForCountry(null, 'Asia/Colombo'), false)
  assert.equal(isTimeZoneForCountry('LK', null), false)
})
