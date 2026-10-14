import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { KycDocumentStore } from './documents.js'
import { ManualKycProvider } from './manual.js'
import { KycSandboxProvider } from './sandbox.js'
import { KycError, KycService, requiredDocumentKinds } from './service.js'

type Row = Record<string, unknown> & { id: string }
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('photo-bytes')])
const DAY = 24 * 60 * 60 * 1000

function setup(options: { withStore?: boolean; failAudit?: boolean; userId?: string; config?: Record<string, number> } = {}) {
  const clock = { now: new Date('2026-10-11T00:00:00Z') }
  const cases: Row[] = []
  const docs: Row[] = []
  const audits: Array<Record<string, unknown>> = []
  const notices: string[] = []
  const files = new Map<string, Buffer>()
  let seq = 0
  let fileSeq = 0
  const user = { email: 'a@example.com', emailVerifiedAt: new Date('2026-01-01'), legalName: 'Ada Lovelace', dateOfBirth: new Date('1990-05-05'), countryCode: 'LK' }
  const matches = (row: Row, where: Record<string, unknown> = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return (value as { in: unknown[] }).in.includes(row[key])
    if (value && typeof value === 'object' && 'not' in value) return row[key] !== (value as { not: unknown }).not
    if (value && typeof value === 'object' && 'lte' in value) return row[key] instanceof Date && (row[key] as Date).getTime() <= (value as { lte: Date }).lte.getTime()
    return row[key] === value
  })
  const withDocs = (row: Row) => ({ ...row, documents: docs.filter((d) => d.caseId === row.id).map((d) => ({ ...d, createdAt: d.createdAt })) })
  const prisma = {
    user: { findUnique: async () => user },
    kycCase: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) => cases.filter((r) => matches(r, where)).sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()).map(withDocs),
      findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => cases.find((r) => matches(r, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => cases.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'case-' + ++seq, createdAt: new Date(clock.now.getTime() + seq), providerCaseId: null, flowUrl: null, ...data } as Row
        cases.push(row)
        return row
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(cases.find((r) => r.id === where.id)!, data),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hits = cases.filter((r) => matches(r, where))
        hits.forEach((r) => Object.assign(r, data))
        return { count: hits.length }
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const hits = cases.filter((r) => matches(r, where))
        hits.forEach((r) => { cases.splice(cases.indexOf(r), 1); docs.splice(0, docs.length, ...docs.filter((d) => d.caseId !== r.id)) })
        return { count: hits.length }
      },
    },
    kycDocument: {
      findMany: async ({ where }: { where?: Record<string, unknown> } = {}) => docs.filter((d) => matches(d, where)),
      findFirst: async ({ where }: { where?: Record<string, unknown> } = {}) => docs.find((d) => matches(d, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => docs.find((d) => d.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: 'doc-' + ++seq, createdAt: new Date(clock.now), ...data } as Row
        docs.push(row)
        return row
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        const hits = docs.filter((d) => matches(d, where))
        hits.forEach((d) => docs.splice(docs.indexOf(d), 1))
        return { count: hits.length }
      },
    },
    kycEvent: {},
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (options.failAudit && data.action === 'KYC_DOCUMENT_VIEWED') throw new Error('audit down')
        audits.push(data)
        return data
      },
    },
  } as unknown as PrismaClient
  const store: KycDocumentStore = {
    put: async (data) => { const key = String(++fileSeq).padStart(32, '0'); files.set(key, data); return key },
    get: async (key) => { const found = files.get(key); if (!found) throw new Error('missing'); return found },
    remove: async (key) => { files.delete(key) },
  }
  const sandbox = new KycSandboxProvider('secret')
  const service = new KycService(
    prisma,
    [new ManualKycProvider(), sandbox],
    async (_user, _type, title) => { notices.push(title) },
    { maxAttempts: 3, relaxReviewChecks: false, maxFileBytes: 1000 + JPEG.length, ...options.config },
    undefined,
    () => clock.now,
    options.withStore === false ? null : store,
  )
  return { service, cases, docs, audits, notices, files, clock, sandbox }
}

const CHECKLIST = { nameMatches: true, dateOfBirthMatches: true, notExpired: true, selfieMatches: true, noSignsOfTampering: true, sanctionsChecked: true }
const code = (expected: string) => (error: unknown) => error instanceof KycError && error.code === expected

async function submitted(ctx: ReturnType<typeof setup>, documentType = 'passport') {
  await ctx.service.start('u1', { documentType, provider: 'manual' })
  for (const kind of requiredDocumentKinds(documentType)) await ctx.service.uploadDocument('u1', { kind, data: JPEG })
  return ctx.service.submitForReview('u1')
}

describe('manual KYC: customer side', () => {
  it('starts a manual case that asks for uploads and schedules draft cleanup', async () => {
    const ctx = setup()
    const status = await ctx.service.start('u1', { documentType: 'national_id', provider: 'manual' })
    assert.equal(status.case?.flow?.kind, 'upload')
    assert.deepEqual(status.case?.requiredDocuments, ['ID_FRONT', 'ID_BACK', 'SELFIE'])
    assert.equal(status.providers.length, 2)
    assert.equal((ctx.cases[0]?.documentsPurgeAt as Date).getTime(), ctx.clock.now.getTime() + 7 * DAY)
    assert.deepEqual(requiredDocumentKinds('passport'), ['ID_FRONT', 'SELFIE'])
  })

  it('lets the customer pick a provider and rejects an unknown one', async () => {
    const ctx = setup()
    await assert.rejects(ctx.service.start('u1', { documentType: 'passport', provider: 'nope' }), code('INVALID_PROVIDER'))
    const status = await ctx.service.start('u1', { documentType: 'passport', provider: 'sandbox' })
    assert.equal(status.case?.provider, 'sandbox')
    assert.equal(status.case?.flow?.kind, 'sandbox')
  })

  it('validates uploads by content, size, kind and need', async () => {
    const ctx = setup()
    await ctx.service.start('u1', { documentType: 'passport', provider: 'manual' })
    await assert.rejects(ctx.service.uploadDocument('u1', { kind: 'ID_FRONT', data: Buffer.from('<svg onload=alert(1)/>') }), code('UNSUPPORTED_FILE_TYPE'))
    await assert.rejects(ctx.service.uploadDocument('u1', { kind: 'ID_FRONT', data: Buffer.alloc(0) }), code('EMPTY_FILE'))
    await assert.rejects(ctx.service.uploadDocument('u1', { kind: 'ID_FRONT', data: Buffer.concat([JPEG, Buffer.alloc(5000)]) }), code('FILE_TOO_LARGE'))
    await assert.rejects(ctx.service.uploadDocument('u1', { kind: 'PASSPORT_SCAN', data: JPEG }), code('INVALID_DOCUMENT_KIND'))
    await assert.rejects(ctx.service.uploadDocument('u1', { kind: 'ID_BACK', data: JPEG }), code('DOCUMENT_NOT_NEEDED'))
    assert.equal(ctx.files.size, 0)
  })

  it('needs an open manual case and a configured store', async () => {
    const ctx = setup()
    await assert.rejects(ctx.service.uploadDocument('u1', { kind: 'ID_FRONT', data: JPEG }), code('NO_OPEN_CASE'))
    await assert.rejects(setup({ withStore: false }).service.uploadDocument('u1', { kind: 'ID_FRONT', data: JPEG }), code('MANUAL_KYC_UNAVAILABLE'))
  })

  it('replaces an earlier upload of the same kind and deletes the old file', async () => {
    const ctx = setup()
    await ctx.service.start('u1', { documentType: 'passport', provider: 'manual' })
    await ctx.service.uploadDocument('u1', { kind: 'ID_FRONT', data: JPEG })
    const status = await ctx.service.uploadDocument('u1', { kind: 'ID_FRONT', data: Buffer.concat([JPEG, Buffer.from('v2')]) })
    assert.equal(ctx.docs.length, 1)
    assert.equal(ctx.files.size, 1)
    assert.equal(status.case?.documents.length, 1)
    assert.equal(JSON.stringify(status).includes('storageKey'), false)
  })

  it('submits only a complete set, then locks the upload', async () => {
    const ctx = setup()
    await ctx.service.start('u1', { documentType: 'passport', provider: 'manual' })
    await ctx.service.uploadDocument('u1', { kind: 'ID_FRONT', data: JPEG })
    await assert.rejects(ctx.service.submitForReview('u1'), code('DOCUMENTS_MISSING'))
    await ctx.service.uploadDocument('u1', { kind: 'SELFIE', data: JPEG })
    const status = await ctx.service.submitForReview('u1')
    assert.equal(status.status, 'IN_REVIEW')
    assert.equal(ctx.cases[0]?.documentsPurgeAt, null)
    await assert.rejects(ctx.service.uploadDocument('u1', { kind: 'SELFIE', data: JPEG }), code('CASE_LOCKED'))
    await assert.rejects(ctx.service.submitForReview('u1'), code('CASE_LOCKED'))
  })

  it('never accepts a webhook for the manual provider', async () => {
    const ctx = setup()
    await assert.rejects(ctx.service.handleWebhook('manual', '{}', {}), (error) => error instanceof KycError && error.statusCode === 401)
  })
})

describe('manual KYC: admin side', () => {
  it('cannot decide a case that has not been submitted', async () => {
    const ctx = setup()
    await ctx.service.start('u1', { documentType: 'passport', provider: 'manual' })
    await assert.rejects(ctx.service.approveCase('admin', 'case-1', CHECKLIST), code('NOT_SUBMITTED'))
    await assert.rejects(ctx.service.rejectCase('admin', 'case-1', 'blurry photo'), code('NOT_SUBMITTED'))
  })

  it('requires every checklist item to approve', async () => {
    const ctx = setup()
    await submitted(ctx)
    await assert.rejects(ctx.service.approveCase('admin', 'case-1'), code('CHECKLIST_INCOMPLETE'))
    await assert.rejects(ctx.service.approveCase('admin', 'case-1', { ...CHECKLIST, sanctionsChecked: false }), code('CHECKLIST_INCOMPLETE'))
    assert.equal(ctx.cases[0]?.status, 'IN_REVIEW')
  })

  it('refuses to approve when a required document has gone missing', async () => {
    const ctx = setup()
    await submitted(ctx)
    ctx.docs.pop()
    await assert.rejects(ctx.service.approveCase('admin', 'case-1', CHECKLIST), code('DOCUMENTS_MISSING'))
  })

  it('approves, records the checklist and notifies; approved documents are kept while the account is active', async () => {
    const ctx = setup()
    await submitted(ctx)
    await ctx.service.approveCase('admin', 'case-1', CHECKLIST)
    assert.equal(ctx.cases[0]?.status, 'APPROVED')
    assert.equal(ctx.cases[0]?.documentsPurgeAt, null)
    assert.deepEqual(ctx.notices, ['Identity verified'])
    const audit = ctx.audits.find((a) => a.action === 'KYC_APPROVED')
    assert.deepEqual((audit?.metadata as { checklist: unknown }).checklist, CHECKLIST)
    await assert.rejects(ctx.service.approveCase('admin', 'case-1', CHECKLIST), code('CASE_NOT_OPEN'))
  })

  it('can still be told to delete approved documents after a fixed number of days', async () => {
    const ctx = setup({ config: { retentionApprovedDays: 30 } })
    await submitted(ctx)
    await ctx.service.approveCase('admin', 'case-1', CHECKLIST)
    assert.equal((ctx.cases[0]?.documentsPurgeAt as Date).getTime(), ctx.clock.now.getTime() + 30 * DAY)
  })

  it('schedules deletion when the account is deactivated and cancels it when the account is reactivated', async () => {
    const ctx = setup()
    await submitted(ctx)
    await ctx.service.approveCase('admin', 'case-1', CHECKLIST)
    assert.equal(await ctx.service.scheduleDeactivationPurge('u1'), 1)
    assert.equal((ctx.cases[0]?.documentsPurgeAt as Date).getTime(), ctx.clock.now.getTime() + 30 * DAY)
    assert.ok(ctx.audits.some((a) => a.action === 'KYC_PURGE_SCHEDULED_ON_DEACTIVATION'))
    // Scheduling twice does not push the date back.
    assert.equal(await ctx.service.scheduleDeactivationPurge('u1'), 0)
    assert.equal(await ctx.service.cancelDeactivationPurge('u1'), 1)
    assert.equal(ctx.cases[0]?.documentsPurgeAt, null)
  })

  it('deletes the stored files once the deactivation period has passed', async () => {
    const ctx = setup({ config: { retentionAfterDeactivationDays: 10 } })
    await submitted(ctx)
    await ctx.service.approveCase('admin', 'case-1', CHECKLIST)
    assert.ok(ctx.files.size > 0)
    await ctx.service.scheduleDeactivationPurge('u1')
    assert.equal(await ctx.service.purgeExpiredDocuments(), 0)
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 11 * DAY)
    assert.ok(await ctx.service.purgeExpiredDocuments() > 0)
    assert.equal(ctx.files.size, 0)
    assert.equal(ctx.docs.length, 0)
  })

  it('rejects with a reason and a shorter retention', async () => {
    const ctx = setup()
    await submitted(ctx)
    await ctx.service.rejectCase('admin', 'case-1', 'Photo is too blurry')
    assert.equal(ctx.cases[0]?.status, 'REJECTED')
    assert.equal((ctx.cases[0]?.documentsPurgeAt as Date).getTime(), ctx.clock.now.getTime() + 14 * DAY)
  })

  it('does not let an administrator decide their own verification', async () => {
    const ctx = setup()
    await submitted(ctx)
    await assert.rejects(ctx.service.approveCase('u1', 'case-1', CHECKLIST), code('SELF_REVIEW_NOT_ALLOWED'))
  })

  it('shows a document only after the view has been audited', async () => {
    const ctx = setup()
    await submitted(ctx)
    const list = await ctx.service.listCaseDocuments('case-1')
    assert.equal(list.length, 2)
    assert.equal(JSON.stringify(list).includes('storageKey'), false)
    const shown = await ctx.service.readDocument('admin', list[0]!.id)
    assert.deepEqual(shown.data, JPEG)
    const audit = ctx.audits.find((a) => a.action === 'KYC_DOCUMENT_VIEWED')
    assert.equal(audit?.actorUserId, 'admin')
    await assert.rejects(ctx.service.readDocument('admin', 'missing'), code('DOCUMENT_NOT_FOUND'))
  })

  it('does not show a document when the audit entry cannot be written', async () => {
    const ctx = setup({ failAudit: true })
    await submitted(ctx)
    const list = await ctx.service.listCaseDocuments('case-1')
    await assert.rejects(ctx.service.readDocument('admin', list[0]!.id), code('AUDIT_UNAVAILABLE'))
  })
})

describe('manual KYC: retention', () => {
  it('keeps approved documents indefinitely by default', async () => {
    const ctx = setup()
    await submitted(ctx)
    await ctx.service.approveCase('admin', 'case-1', CHECKLIST)
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 5 * 365 * DAY)
    assert.equal(await ctx.service.purgeExpiredDocuments(), 0)
    assert.equal(ctx.files.size, 2)
  })

  it('deletes files after the retention period and keeps the decision', async () => {
    const ctx = setup({ config: { retentionApprovedDays: 30 } })
    await submitted(ctx)
    await ctx.service.approveCase('admin', 'case-1', CHECKLIST)
    assert.equal(await ctx.service.purgeExpiredDocuments(), 0)
    assert.equal(ctx.files.size, 2)
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 31 * DAY)
    assert.equal(await ctx.service.purgeExpiredDocuments(), 2)
    assert.equal(ctx.files.size, 0)
    assert.equal(ctx.docs.length, 0)
    assert.equal(ctx.cases[0]?.status, 'APPROVED')
    assert.equal(ctx.cases[0]?.documentsPurgeAt, null)
    assert.ok(ctx.audits.some((a) => a.action === 'KYC_DOCUMENTS_PURGED'))
    assert.equal(await ctx.service.purgeExpiredDocuments(), 0)
  })

  it('never deletes documents that are still under review', async () => {
    const ctx = setup()
    await submitted(ctx)
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 400 * DAY)
    assert.equal(await ctx.service.purgeExpiredDocuments(), 0)
    assert.equal(ctx.files.size, 2)
  })

  it('discards an unfinished upload without counting it as an attempt', async () => {
    const ctx = setup()
    await ctx.service.start('u1', { documentType: 'passport', provider: 'manual' })
    await ctx.service.uploadDocument('u1', { kind: 'ID_FRONT', data: JPEG })
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 8 * DAY)
    assert.equal(await ctx.service.purgeExpiredDocuments(), 1)
    assert.equal(ctx.cases.length, 0)
    assert.equal(ctx.files.size, 0)
    const status = await ctx.service.getStatus('u1')
    assert.equal(status.attemptsUsed, 0)
    assert.equal(status.canStart, true)
  })

  it('leaves a document in place when its file cannot be removed, so the next run retries', async () => {
    const ctx = setup()
    await submitted(ctx)
    await ctx.service.rejectCase('admin', 'case-1', 'Photo is too blurry')
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 15 * DAY)
    const original = ctx.files.delete.bind(ctx.files)
    ctx.files.delete = () => { throw new Error('disk busy') }
    assert.equal(await ctx.service.purgeExpiredDocuments(), 0)
    assert.equal(ctx.docs.length, 2)
    ctx.files.delete = original
    assert.equal(await ctx.service.purgeExpiredDocuments(), 2)
  })
})
