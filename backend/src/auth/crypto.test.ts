import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hashOpaqueToken, hashPassword, verifyPassword } from './crypto.js'

describe('authentication crypto', () => {
  it('hashes passwords with a unique salt and verifies them', async () => {
    const first = await hashPassword('A-strong-password-123')
    const second = await hashPassword('A-strong-password-123')
    assert.notEqual(first, second)
    assert.equal(await verifyPassword('A-strong-password-123', first), true)
    assert.equal(await verifyPassword('wrong-password', first), false)
  })

  it('creates deterministic one-way hashes for session tokens', () => {
    const first = hashOpaqueToken('example-session-token')
    const second = hashOpaqueToken('example-session-token')
    assert.equal(first, second)
    assert.match(first, /^[a-f0-9]{64}$/)
  })
})
