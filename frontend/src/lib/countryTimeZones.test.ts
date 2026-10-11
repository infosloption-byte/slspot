import test from 'node:test'
import assert from 'node:assert/strict'
import { COUNTRY_TIME_ZONES, defaultTimeZoneForCountry, timeZonesForCountry } from '../data/countryTimeZones'

test('country time zone data includes Sri Lanka and multi-zone countries', () => {
  assert.deepEqual(timeZonesForCountry('LK'), ['Asia/Colombo'])
  assert.ok(timeZonesForCountry('US').includes('America/Los_Angeles'))
  assert.ok(timeZonesForCountry('CA').includes('America/Toronto'))
})

test('country time zone defaults prefer a valid existing selection', () => {
  assert.equal(defaultTimeZoneForCountry('LK', 'Europe/London'), 'Asia/Colombo')
  assert.equal(defaultTimeZoneForCountry('US', 'America/Los_Angeles'), 'America/Los_Angeles')
  assert.equal(defaultTimeZoneForCountry('??', 'America/Los_Angeles'), '')
})

test('every advertised country has at least one valid IANA time zone', () => {
  assert.equal(COUNTRY_TIME_ZONES.length, 247)
  for (const country of COUNTRY_TIME_ZONES) {
    assert.ok(country.code.length === 2, country.code)
    assert.ok(country.name.length > 0, country.code)
    assert.ok(country.timezones.length > 0, country.code)
  }
})
