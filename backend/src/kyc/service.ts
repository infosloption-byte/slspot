import type { Prisma, PrismaClient } from '../generated/prisma/client.js'
import { ageOn, MINIMUM_AGE_YEARS, missingProfileFields } from '../payments/rules.js'
import { KYC_UPLOAD_KINDS, sha256Hex, sniffImageMime, type KycDocumentStore, type KycUploadKind } from './documents.js'
import {
  InvalidKycSignatureError,
  KYC_DOCUMENT_TYPES,
  type KycDocumentType,
  type KycFlow,
  type KycProviderAdapter,
  type KycWebhookHeaders,
  type NormalizedKycEvent,
} from './types.js'

export class KycError extends Error {
  readonly statusCode: number
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'KycError'
    this.statusCode = statusCode
    this.code = code
  }
}

export type KycConfig = {
  maxAttempts: number
  relaxReviewChecks: boolean
  /** Days uploaded documents are kept after an approval (default 30). */
  retentionApprovedDays?: number
  /** Days uploaded documents are kept after a rejection (default 14). */
  retentionRejectedDays?: number
  /** Days an unfinished upload is kept before it is discarded (default 7). */
  draftRetentionDays?: number
  /** Largest accepted upload in bytes (default 8 MB). */
  maxFileBytes?: number
}

export const MANUAL_PROVIDER_ID = 'manual'
const DAY_MS = 24 * 60 * 60 * 1000

/** Everything an administrator must confirm before approving a manually reviewed identity. */
export type KycReviewChecklist = {
  nameMatches: boolean
  dateOfBirthMatches: boolean
  notExpired: boolean
  selfieMatches: boolean
  noSignsOfTampering: boolean
  sanctionsChecked: boolean
}
const CHECKLIST_KEYS: (keyof KycReviewChecklist)[] = ['nameMatches', 'dateOfBirthMatches', 'notExpired', 'selfieMatches', 'noSignsOfTampering', 'sanctionsChecked']

/** A passport has a single photo page; other documents need both sides. */
export function requiredDocumentKinds(documentType: string | null): KycUploadKind[] {
  return documentType === 'passport' ? ['ID_FRONT', 'SELFIE'] : ['ID_FRONT', 'ID_BACK', 'SELFIE']
}

type Notify = (userId: string, type: 'VERIFICATION', title: string, body: string) => Promise<unknown>
type LoggerLike = { warn: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void; info: (obj: object, msg?: string) => void }

type CaseStatus = 'NOT_STARTED' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED'
const ACTIVE: CaseStatus[] = ['PENDING', 'IN_REVIEW']

export type KycCaseView = {
  id: string
  status: CaseStatus
  documentType: string | null
  decisionReason: string | null
  submittedAt: string | null
  resolvedAt: string | null
  createdAt: string
  provider: string | null
  /** Only present while the case is open: what the customer must do next. */
  flow: KycFlow | null
  /** Manual review only: what has been uploaded so far and what is still needed. */
  documents: KycDocumentView[]
  requiredDocuments: KycUploadKind[]
}

export type KycDocumentView = { kind: string; mimeType: string; sizeBytes: number; uploadedAt: string }
export type KycProviderView = { id: string; displayName: string; sandbox: boolean; kind: 'hosted' | 'manual' }

export type KycStatusView = {
  status: CaseStatus
  case: KycCaseView | null
  /** The provider used when the customer does not choose one. */
  provider: { id: string; displayName: string; sandbox: boolean } | null
  providers: KycProviderView[]
  documentTypes: readonly KycDocumentType[]
  requirements: { emailVerified: boolean; missingProfile: string[]; ageOk: boolean }
  attemptsUsed: number
  maxAttempts: number
  canStart: boolean
  blockedReason: string | null
}

export type KycAdminCase = {
  id: string
  status: CaseStatus
  provider: string | null
  providerCaseId: string | null
  documentType: string | null
  decisionReason: string | null
  documentCount: number
  user: { id: string; email: string; legalName: string | null; dateOfBirth: string | null; countryCode: string | null }
  submittedAt: string | null
  resolvedAt: string | null
  createdAt: string
}

type CaseRow = {
  id: string
  status: string
  provider?: string | null
  documentType: string | null
  decisionReason: string | null
  flowUrl?: string | null
  submittedAt: Date | null
  resolvedAt: Date | null
  createdAt: Date
  documents?: Array<{ kind: string; mimeType: string; sizeBytes: number; createdAt: Date }>
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

export class KycService {
  private readonly adapters: KycProviderAdapter[]

  constructor(
    private readonly prisma: PrismaClient,
    adapters: KycProviderAdapter | KycProviderAdapter[] | null,
    private readonly notify: Notify,
    private readonly config: KycConfig,
    private readonly logger: LoggerLike = { warn: () => undefined, error: () => undefined, info: () => undefined },
    private readonly now: () => Date = () => new Date(),
    private readonly store: KycDocumentStore | null = null,
  ) {
    this.adapters = adapters === null ? [] : Array.isArray(adapters) ? adapters : [adapters]
  }

  /** The provider used when the customer does not choose one. */
  get provider(): KycProviderAdapter | null {
    return this.adapters[0] ?? null
  }

  get providers(): readonly KycProviderAdapter[] {
    return this.adapters
  }

  private adapterFor(id: string | null | undefined): KycProviderAdapter | null {
    return id ? (this.adapters.find((item) => item.id === id) ?? null) : null
  }

  // ------------------------------------------------------------ customer

  async getStatus(userId: string): Promise<KycStatusView> {
    const user = await this.loadUser(userId)
    const cases = await this.prisma.kycCase.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20, include: { documents: { select: { kind: true, mimeType: true, sizeBytes: true, createdAt: true } } } })
    const latest = cases[0] ?? null
    const attemptsUsed = cases.filter((item) => item.status === 'REJECTED').length
    const requirements = this.requirements(user)
    const blockedReason = this.startBlocker(requirements, latest?.status as CaseStatus | undefined, attemptsUsed)
    return {
      status: (latest?.status as CaseStatus | undefined) ?? 'NOT_STARTED',
      case: latest ? this.toView(latest) : null,
      provider: this.provider ? { id: this.provider.id, displayName: this.provider.displayName, sandbox: this.provider.sandbox } : null,
      providers: this.adapters.map((item) => ({ id: item.id, displayName: item.displayName, sandbox: item.sandbox, kind: item.kind })),
      documentTypes: KYC_DOCUMENT_TYPES,
      requirements,
      attemptsUsed,
      maxAttempts: this.config.maxAttempts,
      canStart: this.adapters.length > 0 && blockedReason === null,
      blockedReason: this.adapters.length > 0 ? blockedReason : 'Identity verification is not available yet.',
    }
  }

  async start(userId: string, input: { documentType: string; provider?: string }): Promise<KycStatusView> {
    if (this.adapters.length === 0) throw new KycError(503, 'KYC_UNAVAILABLE', 'Identity verification is not available yet')
    const adapter = input.provider ? this.adapterFor(input.provider) : this.provider
    if (!adapter) throw new KycError(400, 'INVALID_PROVIDER', 'Choose one of the available verification methods')
    if (!(KYC_DOCUMENT_TYPES as readonly string[]).includes(input.documentType)) {
      throw new KycError(400, 'INVALID_DOCUMENT_TYPE', 'Choose a passport, national ID or driving licence')
    }
    const documentType = input.documentType as KycDocumentType
    const user = await this.loadUser(userId)
    const existing = await this.prisma.kycCase.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 })
    const latest = existing[0]

    // Starting twice is harmless: an open or approved case is simply returned.
    if (latest && (latest.status === 'APPROVED' || ACTIVE.includes(latest.status as CaseStatus))) return this.getStatus(userId)

    const attemptsUsed = existing.filter((item) => item.status === 'REJECTED').length
    const blocker = this.startBlocker(this.requirements(user), latest?.status as CaseStatus | undefined, attemptsUsed)
    if (blocker) throw new KycError(attemptsUsed >= this.config.maxAttempts ? 403 : 422, attemptsUsed >= this.config.maxAttempts ? 'KYC_ATTEMPTS_EXHAUSTED' : 'KYC_NOT_ELIGIBLE', blocker)

    const created = await this.prisma.kycCase.create({
      data: {
        userId,
        status: 'PENDING',
        provider: adapter.id,
        documentType,
        submittedAt: this.now(),
        // An upload that is never submitted must not sit on the server forever.
        documentsPurgeAt: adapter.kind === 'manual' ? new Date(this.now().getTime() + this.days('draft') * DAY_MS) : null,
      },
    })

    // Two simultaneous starts must still leave one open case: the oldest wins.
    const open = await this.prisma.kycCase.findMany({ where: { userId, status: { in: ACTIVE } }, orderBy: { createdAt: 'asc' } })
    if (open[0] && open[0].id !== created.id) {
      await this.prisma.kycCase.deleteMany({ where: { id: created.id, providerCaseId: null } })
      return this.getStatus(userId)
    }

    try {
      const session = await adapter.createSession({
        caseId: created.id,
        documentType,
        subject: {
          userId,
          email: user.email,
          legalName: user.legalName ?? '',
          dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : '',
          countryCode: user.countryCode ?? '',
        },
      })
      await this.prisma.kycCase.update({
        where: { id: created.id },
        data: { providerCaseId: session.providerCaseId, flowUrl: session.flow.kind === 'redirect' ? session.flow.url.slice(0, 512) : null },
      })
    } catch (error) {
      // The vendor never saw this case, so it must not count as one of the customer's attempts.
      this.logger.error({ err: error, caseId: created.id }, 'Could not start the identity verification session')
      await this.prisma.kycCase.deleteMany({ where: { id: created.id, providerCaseId: null } })
      throw new KycError(502, 'KYC_PROVIDER_UNAVAILABLE', 'The verification service could not be reached. Please try again shortly.')
    }
    await this.audit(userId, 'KYC_STARTED', created.id, { provider: adapter.id, documentType })
    return this.getStatus(userId)
  }

  // ------------------------------------------------------------ webhook

  async handleWebhook(providerId: string, rawBody: string, headers: KycWebhookHeaders): Promise<{ status: 'processed' | 'duplicate' | 'ignored' }> {
    const adapter = this.adapterFor(providerId)
    if (!adapter) throw new KycError(404, 'PROVIDER_NOT_FOUND', 'Unknown verification provider')

    let event: NormalizedKycEvent
    try {
      event = adapter.verifyWebhook(rawBody, headers)
    } catch (error) {
      if (error instanceof InvalidKycSignatureError) {
        this.logger.warn({ provider: providerId, reason: error.message }, 'Rejected KYC webhook')
        throw new KycError(401, 'INVALID_SIGNATURE', 'Webhook signature is invalid')
      }
      throw error
    }

    const key = { provider_eventId: { provider: providerId, eventId: event.eventId } }
    let record = await this.prisma.kycEvent.findUnique({ where: key })
    if (record?.processedAt) return { status: 'duplicate' }
    if (!record) {
      try {
        record = await this.prisma.kycEvent.create({
          data: {
            provider: providerId,
            eventId: event.eventId,
            providerCaseId: event.providerCaseId,
            outcome: event.outcome,
            payload: { event } as unknown as Prisma.InputJsonValue,
          },
        })
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        record = await this.prisma.kycEvent.findUnique({ where: key })
        if (record?.processedAt) return { status: 'duplicate' }
      }
    }

    let outcome: 'processed' | 'ignored'
    try {
      outcome = await this.applyEvent(providerId, event)
    } catch (error) {
      if (record) await this.prisma.kycEvent.update({ where: { id: record.id }, data: { error: String(error instanceof Error ? error.message : error).slice(0, 255) } })
      throw error
    }
    if (record) {
      // An unknown case can be a create/webhook race, so it stays unprocessed and the vendor's retry applies it.
      await this.prisma.kycEvent.update({
        where: { id: record.id },
        data: { processedAt: outcome === 'processed' ? this.now() : null, error: outcome === 'ignored' ? 'No matching case' : null },
      })
    }
    return { status: outcome }
  }

  private async applyEvent(providerId: string, event: NormalizedKycEvent): Promise<'processed' | 'ignored'> {
    const kycCase = await this.prisma.kycCase.findFirst({ where: { provider: providerId, providerCaseId: event.providerCaseId } })
    if (!kycCase) {
      this.logger.warn({ provider: providerId, providerCaseId: event.providerCaseId }, 'KYC webhook for an unknown case')
      return 'ignored'
    }
    if (event.outcome === 'pending') return 'processed'
    if (event.outcome === 'review') {
      await this.prisma.kycCase.updateMany({ where: { id: kycCase.id, status: 'PENDING' }, data: { status: 'IN_REVIEW' } })
      return 'processed'
    }
    await this.decide(kycCase.id, kycCase.userId, event.outcome === 'approved' ? 'APPROVED' : 'REJECTED', event.reason ?? null, null)
    return 'processed'
  }

  // ------------------------------------------------------------ admin

  async listCases(input: { status?: CaseStatus; page: number; pageSize: number }) {
    const where = input.status ? { status: input.status } : {}
    const [total, items] = await Promise.all([
      this.prisma.kycCase.count({ where }),
      this.prisma.kycCase.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: { user: { select: { id: true, email: true, legalName: true, dateOfBirth: true, countryCode: true } }, _count: { select: { documents: true } } },
      }),
    ])
    return {
      items: items.map((item): KycAdminCase => ({
        id: item.id,
        status: item.status as CaseStatus,
        provider: item.provider,
        providerCaseId: item.providerCaseId,
        documentType: item.documentType,
        decisionReason: item.decisionReason,
        documentCount: item._count.documents,
        user: { ...item.user, dateOfBirth: item.user.dateOfBirth ? item.user.dateOfBirth.toISOString().slice(0, 10) : null },
        submittedAt: item.submittedAt?.toISOString() ?? null,
        resolvedAt: item.resolvedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.max(1, Math.ceil(total / input.pageSize)) },
    }
  }

  async approveCase(adminUserId: string, caseId: string, checklist?: Partial<KycReviewChecklist>): Promise<void> {
    await this.adminDecision(adminUserId, caseId, 'APPROVED', null, checklist)
  }

  async rejectCase(adminUserId: string, caseId: string, reason: string): Promise<void> {
    const trimmed = reason.trim()
    if (trimmed.length < 3) throw new KycError(400, 'REASON_REQUIRED', 'A rejection reason is required')
    await this.adminDecision(adminUserId, caseId, 'REJECTED', trimmed.slice(0, 255))
  }

  private async adminDecision(adminUserId: string, caseId: string, status: 'APPROVED' | 'REJECTED', reason: string | null, checklist?: Partial<KycReviewChecklist>): Promise<void> {
    const kycCase = await this.prisma.kycCase.findUnique({ where: { id: caseId } })
    if (!kycCase) throw new KycError(404, 'CASE_NOT_FOUND', 'Verification case not found')
    if (!ACTIVE.includes(kycCase.status as CaseStatus)) throw new KycError(409, 'CASE_NOT_OPEN', 'This case has already been decided')
    // A second person must be involved in verifying an identity, unless this is a local test run.
    if (kycCase.userId === adminUserId && !this.config.relaxReviewChecks) {
      throw new KycError(403, 'SELF_REVIEW_NOT_ALLOWED', 'You cannot decide your own verification')
    }
    if (kycCase.provider === MANUAL_PROVIDER_ID) {
      if (kycCase.status !== 'IN_REVIEW') throw new KycError(409, 'NOT_SUBMITTED', 'The customer has not submitted their documents yet')
      if (status === 'APPROVED') {
        const uploaded = await this.prisma.kycDocument.findMany({ where: { caseId }, select: { kind: true } })
        const missing = requiredDocumentKinds(kycCase.documentType).filter((kind) => !uploaded.some((doc) => doc.kind === kind))
        if (missing.length > 0) throw new KycError(422, 'DOCUMENTS_MISSING', 'Documents are missing, so this identity cannot be approved')
        // Approval is an attestation, so each check must be explicitly confirmed.
        if (!CHECKLIST_KEYS.every((key) => checklist?.[key] === true)) throw new KycError(400, 'CHECKLIST_INCOMPLETE', 'Confirm every item on the review checklist before approving')
      }
    }
    const changed = await this.decide(kycCase.id, kycCase.userId, status, reason, adminUserId, checklist)
    if (!changed) throw new KycError(409, 'CASE_NOT_OPEN', 'This case was decided while you were reviewing it')
  }

  // ------------------------------------------------------------ manual review: customer

  /** Store one uploaded image for the customer's open manual case, replacing any earlier upload of the same kind. */
  async uploadDocument(userId: string, input: { kind: string; data: Buffer }): Promise<KycStatusView> {
    const store = this.requireStore()
    if (!(KYC_UPLOAD_KINDS as readonly string[]).includes(input.kind)) throw new KycError(400, 'INVALID_DOCUMENT_KIND', 'Unknown document kind')
    const kind = input.kind as KycUploadKind
    if (input.data.length === 0) throw new KycError(400, 'EMPTY_FILE', 'The file is empty')
    if (input.data.length > (this.config.maxFileBytes ?? 8 * 1024 * 1024)) throw new KycError(413, 'FILE_TOO_LARGE', 'The file is too large. Use a photo under ' + Math.floor((this.config.maxFileBytes ?? 8 * 1024 * 1024) / (1024 * 1024)) + ' MB.')
    // The client's own MIME type is ignored: the content has to be a real JPG, PNG or WebP image.
    const mimeType = sniffImageMime(input.data)
    if (!mimeType) throw new KycError(415, 'UNSUPPORTED_FILE_TYPE', 'Upload a JPG, PNG or WebP photo')

    const kycCase = await this.openManualCase(userId)
    if (!requiredDocumentKinds(kycCase.documentType).includes(kind)) throw new KycError(400, 'DOCUMENT_NOT_NEEDED', 'That document is not needed for the selected ID type')

    const storageKey = await store.put(input.data)
    try {
      const previous = await this.prisma.kycDocument.findFirst({ where: { caseId: kycCase.id, kind } })
      if (previous) await this.prisma.kycDocument.deleteMany({ where: { id: previous.id } })
      await this.prisma.kycDocument.create({
        data: { caseId: kycCase.id, userId, kind, storageKey, mimeType, sizeBytes: input.data.length, sha256: sha256Hex(input.data) },
      })
      if (previous) await store.remove(previous.storageKey).catch((error: unknown) => this.logger.warn({ err: error, caseId: kycCase.id }, 'Could not remove a replaced KYC document'))
    } catch (error) {
      await store.remove(storageKey).catch(() => undefined)
      if (isUniqueViolation(error)) throw new KycError(409, 'UPLOAD_CONFLICT', 'Another upload was in progress. Please try again.')
      throw error
    }

    // If the customer submitted in the meantime the set under review must not change, so undo this upload.
    const current = await this.prisma.kycCase.findUnique({ where: { id: kycCase.id } })
    if (!current || current.status !== 'PENDING') {
      await this.prisma.kycDocument.deleteMany({ where: { storageKey } })
      await store.remove(storageKey).catch(() => undefined)
      throw new KycError(409, 'CASE_LOCKED', 'Your documents were already submitted for review')
    }
    await this.audit(userId, 'KYC_DOCUMENT_UPLOADED', kycCase.id, { kind, mimeType, sizeBytes: input.data.length })
    return this.getStatus(userId)
  }

  /** Hand the uploaded set to the reviewers. After this the customer can no longer change it. */
  async submitForReview(userId: string): Promise<KycStatusView> {
    const kycCase = await this.openManualCase(userId)
    const uploaded = await this.prisma.kycDocument.findMany({ where: { caseId: kycCase.id }, select: { kind: true } })
    const missing = requiredDocumentKinds(kycCase.documentType).filter((kind) => !uploaded.some((doc) => doc.kind === kind))
    if (missing.length > 0) throw new KycError(422, 'DOCUMENTS_MISSING', 'Upload every required photo before submitting')
    const result = await this.prisma.kycCase.updateMany({
      where: { id: kycCase.id, status: 'PENDING' },
      // Documents under review are kept until a decision sets the retention clock.
      data: { status: 'IN_REVIEW', submittedAt: this.now(), documentsPurgeAt: null },
    })
    if (result.count !== 1) throw new KycError(409, 'CASE_LOCKED', 'Your documents were already submitted for review')
    await this.audit(userId, 'KYC_SUBMITTED', kycCase.id, { documents: uploaded.length })
    return this.getStatus(userId)
  }

  private async openManualCase(userId: string) {
    this.requireStore()
    const kycCase = await this.prisma.kycCase.findFirst({ where: { userId, provider: MANUAL_PROVIDER_ID, status: 'PENDING' } })
    if (kycCase) return kycCase
    const submitted = await this.prisma.kycCase.findFirst({ where: { userId, provider: MANUAL_PROVIDER_ID, status: 'IN_REVIEW' } })
    if (submitted) throw new KycError(409, 'CASE_LOCKED', 'Your documents were already submitted for review')
    throw new KycError(409, 'NO_OPEN_CASE', 'Start a manual verification first')
  }

  private requireStore(): KycDocumentStore {
    if (!this.store || !this.adapterFor(MANUAL_PROVIDER_ID)) throw new KycError(503, 'MANUAL_KYC_UNAVAILABLE', 'Manual document verification is not available')
    return this.store
  }

  // ------------------------------------------------------------ manual review: admin

  async listCaseDocuments(caseId: string) {
    const docs = await this.prisma.kycDocument.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } })
    return docs.map((doc) => ({ id: doc.id, kind: doc.kind, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, uploadedAt: doc.createdAt.toISOString() }))
  }

  /**
   * Decrypt one document for an administrator. The view is written to the audit log first: if the log cannot be
   * written the document is not shown, so no one can look at an identity document without leaving a trace.
   */
  async readDocument(adminUserId: string, documentId: string): Promise<{ mimeType: string; kind: string; data: Buffer }> {
    const store = this.requireStore()
    const doc = await this.prisma.kycDocument.findUnique({ where: { id: documentId } })
    if (!doc) throw new KycError(404, 'DOCUMENT_NOT_FOUND', 'Document not found or already deleted')
    try {
      await this.prisma.auditLog.create({
        data: { actorUserId: adminUserId, action: 'KYC_DOCUMENT_VIEWED', entityType: 'KycCase', entityId: doc.caseId, metadata: { documentId: doc.id, kind: doc.kind, subjectUserId: doc.userId } as Prisma.InputJsonValue },
      })
    } catch (error) {
      this.logger.error({ err: error, documentId }, 'Could not audit a KYC document view, so the document was not shown')
      throw new KycError(500, 'AUDIT_UNAVAILABLE', 'The view could not be recorded, so the document was not shown')
    }
    try {
      return { mimeType: doc.mimeType, kind: doc.kind, data: await store.get(doc.storageKey) }
    } catch (error) {
      this.logger.error({ err: error, documentId }, 'Could not read a stored KYC document')
      throw new KycError(410, 'DOCUMENT_UNAVAILABLE', 'The stored document is no longer available')
    }
  }

  // ------------------------------------------------------------ retention

  /**
   * Delete documents whose retention time has passed, and discard uploads that were never submitted.
   * Safe to run repeatedly. A file that cannot be removed is left for the next run.
   */
  async purgeExpiredDocuments(limit = 100): Promise<number> {
    if (!this.store) return 0
    const due = await this.prisma.kycCase.findMany({
      where: { documentsPurgeAt: { lte: this.now() }, status: { in: ['PENDING', 'APPROVED', 'REJECTED'] } },
      take: limit,
      include: { documents: { select: { id: true, storageKey: true } } },
    })
    let purged = 0
    for (const kycCase of due) {
      try {
        for (const doc of kycCase.documents) await this.store.remove(doc.storageKey)
        await this.prisma.kycDocument.deleteMany({ where: { caseId: kycCase.id } })
        if (kycCase.status === 'PENDING' && kycCase.provider === MANUAL_PROVIDER_ID) {
          // Never submitted, so it was not an attempt: remove the empty case too.
          await this.prisma.kycCase.deleteMany({ where: { id: kycCase.id, status: 'PENDING' } })
          await this.audit(kycCase.userId, 'KYC_DRAFT_EXPIRED', kycCase.id, { documents: kycCase.documents.length })
        } else {
          await this.prisma.kycCase.updateMany({ where: { id: kycCase.id }, data: { documentsPurgeAt: null } })
          if (kycCase.documents.length > 0) await this.audit(kycCase.userId, 'KYC_DOCUMENTS_PURGED', kycCase.id, { documents: kycCase.documents.length })
        }
        purged += kycCase.documents.length
      } catch (error) {
        this.logger.error({ err: error, caseId: kycCase.id }, 'Could not purge KYC documents')
      }
    }
    return purged
  }

  // ------------------------------------------------------------ internals

  /** The only place a case reaches APPROVED or REJECTED. Conditional on the case still being open. */
  private async decide(caseId: string, userId: string, status: 'APPROVED' | 'REJECTED', reason: string | null, adminUserId: string | null, checklist?: Partial<KycReviewChecklist>): Promise<boolean> {
    const result = await this.prisma.kycCase.updateMany({
      where: { id: caseId, status: { in: ACTIVE } },
      data: {
        status,
        decisionReason: status === 'REJECTED' ? (reason ?? 'The identity check was not successful').slice(0, 255) : null,
        resolvedAt: this.now(),
        reviewedByUserId: adminUserId,
        // The hosted link is single-use and secret; uploaded documents (manual review) are deleted on a schedule.
        flowUrl: null,
        documentsPurgeAt: new Date(this.now().getTime() + this.days(status === 'APPROVED' ? 'approved' : 'rejected') * DAY_MS),
      },
    })
    if (result.count !== 1) return false
    await this.audit(adminUserId ?? userId, status === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED', caseId, { subjectUserId: userId, byAdmin: adminUserId !== null, reason, ...(checklist ? { checklist } : {}) })
    if (status === 'APPROVED') {
      await this.safeNotify(userId, 'Identity verified', 'Your identity has been verified. Withdrawals are now available subject to the usual checks.')
    } else {
      await this.safeNotify(userId, 'Identity verification unsuccessful', 'We could not verify your identity' + (reason ? ': ' + reason : '.') + ' You can review the details and try again from your wallet.')
    }
    return true
  }

  private toView(item: CaseRow): KycCaseView {
    const open = ACTIVE.includes(item.status as CaseStatus)
    const adapter = this.adapterFor(item.provider)
    // Sandbox and upload flows need no stored data. A hosted vendor's link was saved when the case started.
    let flow: KycFlow | null = null
    if (open) {
      if (adapter?.sandbox) flow = { kind: 'sandbox' }
      else if (adapter?.kind === 'manual') flow = { kind: 'upload' }
      else if (item.flowUrl) flow = { kind: 'redirect', url: item.flowUrl }
    }
    return {
      id: item.id,
      status: item.status as CaseStatus,
      documentType: item.documentType,
      decisionReason: item.decisionReason,
      submittedAt: item.submittedAt?.toISOString() ?? null,
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      provider: item.provider ?? null,
      flow,
      documents: (item.documents ?? []).map((doc) => ({ kind: doc.kind, mimeType: doc.mimeType, sizeBytes: doc.sizeBytes, uploadedAt: doc.createdAt.toISOString() })),
      requiredDocuments: adapter?.kind === 'manual' ? requiredDocumentKinds(item.documentType) : [],
    }
  }

  private requirements(user: { emailVerifiedAt: Date | null; legalName: string | null; dateOfBirth: Date | null; countryCode: string | null }) {
    const age = user.dateOfBirth ? ageOn(user.dateOfBirth, this.now()) : null
    return {
      emailVerified: user.emailVerifiedAt !== null,
      missingProfile: missingProfileFields({ emailVerified: user.emailVerifiedAt !== null, legalName: user.legalName, dateOfBirth: user.dateOfBirth, countryCode: user.countryCode }) as string[],
      ageOk: age !== null && age >= MINIMUM_AGE_YEARS,
    }
  }

  private startBlocker(requirements: { emailVerified: boolean; missingProfile: string[]; ageOk: boolean }, latest: CaseStatus | undefined, attemptsUsed: number): string | null {
    if (latest === 'APPROVED') return 'Your identity is already verified.'
    if (latest && ACTIVE.includes(latest)) return 'A verification is already in progress.'
    if (!requirements.emailVerified) return 'Verify your email address first.'
    if (requirements.missingProfile.length > 0) return 'Complete your legal name, date of birth and country first.'
    if (!requirements.ageOk) return 'You must be at least ' + MINIMUM_AGE_YEARS + ' years old to verify your identity.'
    if (attemptsUsed >= this.config.maxAttempts) return 'You have used all verification attempts. Please contact support.'
    return null
  }

  private days(kind: 'approved' | 'rejected' | 'draft'): number {
    if (kind === 'approved') return this.config.retentionApprovedDays ?? 30
    if (kind === 'rejected') return this.config.retentionRejectedDays ?? 14
    return this.config.draftRetentionDays ?? 7
  }

  private async loadUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true, legalName: true, dateOfBirth: true, countryCode: true },
    })
    if (!user) throw new KycError(404, 'USER_NOT_FOUND', 'Account not found')
    return user
  }

  private async audit(actorUserId: string, action: string, caseId: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { actorUserId, action, entityType: 'KycCase', entityId: caseId, metadata: metadata as Prisma.InputJsonValue } })
    } catch (error) {
      this.logger.error({ err: error, action, caseId }, 'Could not write KYC audit log')
    }
  }

  private async safeNotify(userId: string, title: string, body: string): Promise<void> {
    try {
      await this.notify(userId, 'VERIFICATION', title, body)
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'Could not send KYC notification')
    }
  }
}
