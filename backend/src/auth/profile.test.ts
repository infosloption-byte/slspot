import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PrismaClient } from '../generated/prisma/client.js'
import { AuthError, AuthService } from './service.js'

type UserRow = { id: string; email: string; status: string; countryCode: string | null; displayName: string | null; timezone: string | null; locale: string | null; emailVerifiedAt: Date | null; legalName: string | null; dateOfBirth: Date | null }

function setup(options: { verified: boolean; user?: Partial<UserRow> }) {
  const user: UserRow = {
    id: 'u1', email: 'a@example.com', status: 'ACTIVE', countryCode: 'LK', displayName: null, timezone: 'Asia/Colombo', locale: 'en-US',
    emailVerifiedAt: new Date('2026-01-01'), legalName: 'Ada Lovelace', dateOfBirth: new Date('1990-05-05T00:00:00.000Z'), ...options.user,
  }
  const audits: Array<Record<string, unknown>> = []
  const tx = {
    user: {
      findUnique: async () => ({ ...user }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        for (const [key, value] of Object.entries(data)) if (value !== undefined) (user as Record<string, unknown>)[key] = value
        return { ...user }
      },
    },
    kycCase: { findFirst: async () => (options.verified ? { id: 'case-1' } : null) },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data } },
  }
  const prisma = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient
  return { service: new AuthService(prisma), user, audits }
}

const code = (expected: string) => (error: unknown) => error instanceof AuthError && error.code === expected

describe('profile locking after identity verification', () => {
  it('lets an unverified customer change legal name, date of birth and country', async () => {
    const { service, user } = setup({ verified: false })
    await service.updateProfile('u1', { legalName: 'Ada King', dateOfBirth: '1991-06-06', countryCode: 'GB', timezone: 'Europe/London' })
    assert.equal(user.legalName, 'Ada King')
    assert.equal(user.countryCode, 'GB')
    assert.equal(user.dateOfBirth?.toISOString().slice(0, 10), '1991-06-06')
  })

  it('blocks changes to the verified details with PROFILE_LOCKED and changes nothing', async () => {
    const { service, user } = setup({ verified: true })
    await assert.rejects(service.updateProfile('u1', { legalName: 'Ada King' }), code('PROFILE_LOCKED'))
    await assert.rejects(service.updateProfile('u1', { dateOfBirth: '1991-06-06' }), code('PROFILE_LOCKED'))
    await assert.rejects(service.updateProfile('u1', { countryCode: 'IN', timezone: 'Asia/Kolkata' }), code('PROFILE_LOCKED'))
    assert.equal(user.legalName, 'Ada Lovelace')
    assert.equal(user.countryCode, 'LK')
  })

  it('accepts a resubmission of the same verified values, and still allows other fields', async () => {
    const { service, user } = setup({ verified: true })
    await service.updateProfile('u1', { legalName: 'Ada  Lovelace', dateOfBirth: '1990-05-05', countryCode: 'lk', displayName: 'Ada', timezone: 'Asia/Colombo' })
    assert.equal(user.displayName, 'Ada')
    assert.equal(user.legalName, 'Ada Lovelace')
  })

  it('still allows changing the time zone within the verified country', async () => {
    const { service, user } = setup({ verified: true, user: { timezone: null } })
    await service.updateProfile('u1', { timezone: 'Asia/Colombo' })
    assert.equal(user.timezone, 'Asia/Colombo')
  })
})

describe('country and time zone rule', () => {
  it('rejects a time zone that does not belong to the country', async () => {
    const { service } = setup({ verified: false })
    await assert.rejects(service.updateProfile('u1', { timezone: 'America/New_York' }), code('TIMEZONE_COUNTRY_MISMATCH'))
  })

  it('checks the stored time zone when only the country changes', async () => {
    const { service } = setup({ verified: false })
    await assert.rejects(service.updateProfile('u1', { countryCode: 'US' }), code('TIMEZONE_COUNTRY_MISMATCH'))
  })

  it('accepts a matching pair changed together', async () => {
    const { service, user } = setup({ verified: false })
    await service.updateProfile('u1', { countryCode: 'US', timezone: 'America/Los_Angeles' })
    assert.equal(user.countryCode, 'US')
    assert.equal(user.timezone, 'America/Los_Angeles')
  })

  it('does not object when no time zone was ever chosen', async () => {
    const { service } = setup({ verified: false, user: { timezone: null } })
    await service.updateProfile('u1', { countryCode: 'US' })
  })

  it('rejects unknown time zones and malformed country codes', async () => {
    const { service } = setup({ verified: false })
    await assert.rejects(service.updateProfile('u1', { timezone: 'Mars/Olympus' }), code('INVALID_TIMEZONE'))
    await assert.rejects(service.updateProfile('u1', { countryCode: 'USA' }), code('INVALID_COUNTRY_CODE'))
  })
})
