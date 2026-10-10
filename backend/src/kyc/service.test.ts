import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { KycError, KycService } from './service.js'
import { KycSandboxProvider } from './sandbox.js'
import { InvalidKycSignatureError } from './types.js'
import type { PrismaClient } from '../generated/prisma/client.js'

type Row = Record<string, unknown> & { id: string; status: string; userId: string; createdAt: Date; provider?: string | null; providerCaseId?: string | null }

function setup(userOverrides: Record<string, unknown> = {}, config = { maxAttempts: 2, relaxReviewChecks: false }) {
  const cases: Row[] = []
  const events: Array<Record<string, unknown>> = []
  const audits: Array<Record<string, unknown>> = []
  const notices: string[] = []
  let sequence = 0
  const user = { email: 'a@example.com', emailVerifiedAt: new Date('2026-01-01'), legalName: 'Ada Lovelace', dateOfBirth: new Date('1990-05-05'), countryCode: 'LK', ...userOverrides }
  const matches = (row: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in (value as object)) return ((value as { in: unknown[] }).in).includes(row[key])
    return row[key] === value
  })
  const prisma = {
    user: { findUnique: async () => user },
    kycCase: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) => cases.filter((row) => matches(row, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => cases.find((row) => matches(row, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => cases.find((row) => row.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'case-' + ++sequence, createdAt: new Date(2026, 0, 1, 0, 0, sequence), providerCaseId: null, ...data } as Row
        cases.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(cases.find((row) => row.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hits = cases.filter((row) => matches(row, where))
        hits.forEach((row) => Object.assign(row, data))
        return { count: hits.length }
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const hits = cases.filter((row) => matches(row, where))
        hits.forEach((row) => cases.splice(cases.indexOf(row), 1))
        return { count: hits.length }
      },
    },
    kycEvent: {
      findUnique: async ({ where }: { where: { provider_eventId: { provider: string; eventId: string } } }) => events.find((e) => e.eventId === where.provider_eventId.eventId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { id: 'evt-' + events.length, processedAt: null, ...data }; events.push(row); return row },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(events.find((e) => e.id === where.id)!, data),
    },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => { audits.push(data); return data } },
  } as unknown as PrismaClient
  const provider = new KycSandboxProvider('test-secret')
  const service = new KycService(prisma, provider, async (_user, _type, title) => { notices.push(title) }, config, undefined, () => new Date('2026-10-10'))
  return { service, provider, cases, events, audits, notices }
}

describe('KycSandboxProvider', () => {
  const provider = new KycSandboxProvider('secret')
  it('accepts its own signed webhook and rejects tampering', () => {
    const { rawBody, headers } = provider.simulate('sbx_kyc_1', 'approved')
    assert.equal(provider.verifyWebhook(rawBody, headers).outcome, 'approved')
    assert.throws(() => provider.verifyWebhook(rawBody + ' ', headers), InvalidKycSignatureError)
    assert.throws(() => provider.verifyWebhook(rawBody, {}), InvalidKycSignatureError)
  })
})

describe('KycService', () => {
  it('reports why a customer cannot start yet', async () => {
    const { service } = setup({ emailVerifiedAt: null })
    const status = await service.getStatus('u1')
    assert.equal(status.canStart, false)
    assert.match(status.blockedReason ?? '', /email/i)
    await assert.rejects(service.start('u1', { documentType: 'passport' }), (error) => error instanceof KycError && error.code === 'KYC_NOT_ELIGIBLE')
  })

  it('requires a complete, adult profile', async () => {
    assert.equal((await setup({ legalName: null }).service.getStatus('u1')).canStart, false)
    assert.equal((await setup({ dateOfBirth: new Date('2015-01-01') }).service.getStatus('u1')).canStart, false)
  })

  it('rejects an unknown document type', async () => {
    await assert.rejects(setup().service.start('u1', { documentType: 'library_card' }), (error) => error instanceof KycError && error.code === 'INVALID_DOCUMENT_TYPE')
  })

  it('opens one case and treats a second start as a no-op', async () => {
    const { service, cases } = setup()
    const first = await service.start('u1', { documentType: 'passport' })
    assert.equal(first.status, 'PENDING')
    assert.equal(first.case?.flow?.kind, 'sandbox')
    await service.start('u1', { documentType: 'national_id' })
    assert.equal(cases.length, 1)
    assert.equal(cases[0]?.providerCaseId, 'sbx_kyc_case-1')
  })

  it('approves from a signed webhook, ignores a replay, and notifies once', async () => {
    const { service, provider, cases, notices } = setup()
    await service.start('u1', { documentType: 'passport' })
    const event = provider.simulate('sbx_kyc_case-1', 'approved')
    assert.deepEqual(await service.handleWebhook('sandbox', event.rawBody, event.headers), { status: 'processed' })
    assert.equal(cases[0]?.status, 'APPROVED')
    assert.deepEqual(await service.handleWebhook('sandbox', event.rawBody, event.headers), { status: 'duplicate' })
    assert.deepEqual(notices, ['Identity verified'])
  })

  it('does not let a late rejection overturn an approval', async () => {
    const { service, provider, cases } = setup()
    await service.start('u1', { documentType: 'passport' })
    const approve = provider.simulate('sbx_kyc_case-1', 'approved')
    const reject = provider.simulate('sbx_kyc_case-1', 'rejected')
    await service.handleWebhook('sandbox', approve.rawBody, approve.headers)
    await service.handleWebhook('sandbox', reject.rawBody, reject.headers)
    assert.equal(cases[0]?.status, 'APPROVED')
  })

  it('rejects a bad signature without touching the case', async () => {
    const { service, cases } = setup()
    await service.start('u1', { documentType: 'passport' })
    await assert.rejects(service.handleWebhook('sandbox', '{}', {}), (error) => error instanceof KycError && error.statusCode === 401)
    assert.equal(cases[0]?.status, 'PENDING')
  })

  it('moves a case to review and lets an admin decide it', async () => {
    const { service, provider, cases } = setup()
    await service.start('u1', { documentType: 'passport' })
    const review = provider.simulate('sbx_kyc_case-1', 'review')
    await service.handleWebhook('sandbox', review.rawBody, review.headers)
    assert.equal(cases[0]?.status, 'IN_REVIEW')
    await service.approveCase('admin-1', 'case-1')
    assert.equal(cases[0]?.status, 'APPROVED')
    assert.equal(cases[0]?.reviewedByUserId, 'admin-1')
    await assert.rejects(service.approveCase('admin-1', 'case-1'), (error) => error instanceof KycError && error.code === 'CASE_NOT_OPEN')
  })

  it('blocks deciding your own case unless review checks are relaxed', async () => {
    const { service } = setup()
    await service.start('u1', { documentType: 'passport' })
    await assert.rejects(service.approveCase('u1', 'case-1'), (error) => error instanceof KycError && error.code === 'SELF_REVIEW_NOT_ALLOWED')
    const relaxed = setup({}, { maxAttempts: 2, relaxReviewChecks: true })
    await relaxed.service.start('u1', { documentType: 'passport' })
    await relaxed.service.approveCase('u1', 'case-1')
    assert.equal(relaxed.cases[0]?.status, 'APPROVED')
  })

  it('requires a reason to reject and stops retries after the attempt limit', async () => {
    const { service, cases } = setup()
    await service.start('u1', { documentType: 'passport' })
    await assert.rejects(service.rejectCase('admin-1', 'case-1', ' '), (error) => error instanceof KycError && error.code === 'REASON_REQUIRED')
    await service.rejectCase('admin-1', 'case-1', 'Document unreadable')
    assert.equal(cases[0]?.decisionReason, 'Document unreadable')
    await service.start('u1', { documentType: 'passport' })
    await service.rejectCase('admin-1', 'case-2', 'Mismatched name')
    const status = await service.getStatus('u1')
    assert.equal(status.attemptsUsed, 2)
    assert.equal(status.canStart, false)
    await assert.rejects(service.start('u1', { documentType: 'passport' }), (error) => error instanceof KycError && error.code === 'KYC_ATTEMPTS_EXHAUSTED')
  })
})
