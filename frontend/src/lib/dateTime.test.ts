import test from 'node:test'
import assert from 'node:assert/strict'
import { formatDateTimeSeconds } from './dateTime'

test('trade timestamps include seconds and are shown in the requested time zone', () => {
  const text = formatDateTimeSeconds('2026-10-12T05:30:07.000Z', { timeZone: 'Asia/Colombo' })
  assert.match(text, /11:00:07/)
})

test('two trades five seconds apart are distinguishable', () => {
  const a = formatDateTimeSeconds('2026-10-12T05:30:00Z', { timeZone: 'UTC' })
  const b = formatDateTimeSeconds('2026-10-12T05:30:05Z', { timeZone: 'UTC' })
  assert.notEqual(a, b)
})

test('missing or invalid values fall back instead of throwing', () => {
  assert.equal(formatDateTimeSeconds(undefined), '—')
  assert.equal(formatDateTimeSeconds(null), '—')
  assert.equal(formatDateTimeSeconds('', { fallback: 'n/a' }), 'n/a')
})
