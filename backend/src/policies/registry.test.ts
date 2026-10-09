import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRegistrationPolicyAcceptanceRows, CURRENT_POLICY_VERSIONS, REGISTRATION_POLICY_TYPES } from './registry.js'

test('registration records the current Terms and Privacy policy versions from the server registry', () => {
  const acceptedAt = new Date('2026-10-09T08:00:00.000Z')
  const rows = buildRegistrationPolicyAcceptanceRows('user-1', acceptedAt)

  assert.deepEqual(rows.map((row) => ({ policyType: row.policyType, version: row.version, source: row.source })), [
    { policyType: 'TERMS_AND_CONDITIONS', version: CURRENT_POLICY_VERSIONS.TERMS_AND_CONDITIONS, source: 'REGISTRATION' },
    { policyType: 'PRIVACY_POLICY', version: CURRENT_POLICY_VERSIONS.PRIVACY_POLICY, source: 'REGISTRATION' },
  ])
  assert.equal(rows.every((row) => row.userId === 'user-1' && row.acceptedAt === acceptedAt), true)
  assert.deepEqual(REGISTRATION_POLICY_TYPES, ['TERMS_AND_CONDITIONS', 'PRIVACY_POLICY'])
})

test('policy versions are maintained independently even when initially released together', () => {
  assert.equal(CURRENT_POLICY_VERSIONS.TERMS_AND_CONDITIONS, '2026-10')
  assert.equal(CURRENT_POLICY_VERSIONS.PRIVACY_POLICY, '2026-10')
  assert.ok(CURRENT_POLICY_VERSIONS.TRADING_RULES)
  assert.ok(CURRENT_POLICY_VERSIONS.PAYMENT_POLICY)
  assert.ok(CURRENT_POLICY_VERSIONS.RETURN_REFUND_POLICY)
  assert.ok(CURRENT_POLICY_VERSIONS.AML_KYC_POLICY)
  assert.ok(CURRENT_POLICY_VERSIONS.COOKIE_POLICY)
  assert.ok(CURRENT_POLICY_VERSIONS.CARDHOLDER_AGREEMENT)
})
