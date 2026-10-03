import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createOtpAuthUri,
  createRecoveryCodes,
  createTotpCode,
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  normalizeRecoveryCode,
  verifyTotpCode,
} from './totp.js'

describe('TOTP primitives', () => {
  it('generates and verifies a six-digit code with a bounded time window', () => {
    const secret = generateTotpSecret()
    const timestamp = 1_760_000_000_000
    const code = createTotpCode(secret, timestamp)

    assert.match(secret, /^[A-Z2-7]+$/)
    assert.match(code, /^\d{6}$/)
    assert.equal(verifyTotpCode(secret, code, timestamp), true)
    assert.equal(verifyTotpCode(secret, code, timestamp + 90_000, 1), false)
  })

  it('round-trips encrypted TOTP secrets', () => {
    const secret = generateTotpSecret()
    const key = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
    const encrypted = encryptTotpSecret(secret, key)

    assert.notEqual(encrypted, secret)
    assert.equal(decryptTotpSecret(encrypted, key), secret)
  })

  it('creates an OTP URI and normalized recovery codes', () => {
    const secret = generateTotpSecret()
    const uri = createOtpAuthUri(secret, 'SL Spot', 'trader@example.com')
    const codes = createRecoveryCodes(8)

    assert.match(uri, /^otpauth:\/\/totp\//)
    assert.equal(codes.length, 8)
    assert.equal(new Set(codes).size, 8)
    assert.match(normalizeRecoveryCode(codes[0]!), /^[A-Z0-9]+$/)
  })
})
