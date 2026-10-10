import type { Prisma, PrismaClient } from '../generated/prisma/client.js'
import { ageOn, MINIMUM_AGE_YEARS, missingProfileFields } from '../payments/rules.js'
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

export type KycConfig = { maxAttempts: number; relaxReviewChecks: boolean }

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
  /** Only present while the case is open: what the customer must do next. */
  flow: KycFlow | null
}

export type KycStatusView = {
  status: CaseStatus
  case: KycCaseView | null
  provider: { id: string; displayName: string; sandbox: boolean } | null
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
  user: { id: string; email: string; legalName: string | null; countryCode: string | null }
  submittedAt: string | null
  resolvedAt: string | null
  createdAt: string
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

export class KycService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly adapter: KycProviderAdapter | null,
    private readonly notify: Notify,
    private readonly config: KycConfig,
    private readonly logger: LoggerLike = { warn: () => undefined, error: () => undefined, info: () => undefined },
    private readonly now: () => Date = () => new Date(),
  ) {}

  get provider(): KycProviderAdapter | null {
    return this.adapter
  }

  // ------------------------------------------------------------ customer

  async getStatus(userId: string): Promise<KycStatusView> {
    const user = await this.loadUser(userId)
    const cases = await this.prisma.kycCase.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 })
    const latest = cases[0] ?? null
    const attemptsUsed = cases.filter((item) => item.status === 'REJECTED').length
    const requirements = this.requirements(user)
    const blockedReason = this.startBlocker(requirements, latest?.status as CaseStatus | undefined, attemptsUsed)
    return {
      status: (latest?.status as CaseStatus | undefined) ?? 'NOT_STARTED',
      case: latest ? this.toView(latest) : null,
      provider: this.adapter ? { id: this.adapter.id, displayName: this.adapter.displayName, sandbox: this.adapter.sandbox } : null,
      documentTypes: KYC_DOCUMENT_TYPES,
      requirements,
      attemptsUsed,
      maxAttempts: this.config.maxAttempts,
      canStart: this.adapter !== null && blockedReason === null,
      blockedReason: this.adapter ? blockedReason : 'Identity verification is not available yet.',
    }
  }

  async start(userId: string, input: { documentType: string }): Promise<KycStatusView> {
    if (!this.adapter) throw new KycError(503, 'KYC_UNAVAILABLE', 'Identity verification is not available yet')
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
      data: { userId, status: 'PENDING', provider: this.adapter.id, documentType, submittedAt: this.now() },
    })

    // Two simultaneous starts must still leave one open case: the oldest wins.
    const open = await this.prisma.kycCase.findMany({ where: { userId, status: { in: ACTIVE } }, orderBy: { createdAt: 'asc' } })
    if (open[0] && open[0].id !== created.id) {
      await this.prisma.kycCase.deleteMany({ where: { id: created.id, providerCaseId: null } })
      return this.getStatus(userId)
    }

    try {
      const session = await this.adapter.createSession({
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
      await this.prisma.kycCase.update({ where: { id: created.id }, data: { providerCaseId: session.providerCaseId } })
      this.flows.set(created.id, session.flow)
    } catch (error) {
      // The vendor never saw this case, so it must not count as one of the customer's attempts.
      this.logger.error({ err: error, caseId: created.id }, 'Could not start the identity verification session')
      await this.prisma.kycCase.deleteMany({ where: { id: created.id, providerCaseId: null } })
      throw new KycError(502, 'KYC_PROVIDER_UNAVAILABLE', 'The verification service could not be reached. Please try again shortly.')
    }
    await this.audit(userId, 'KYC_STARTED', created.id, { provider: this.adapter.id, documentType })
    return this.getStatus(userId)
  }

  // ------------------------------------------------------------ webhook

  async handleWebhook(providerId: string, rawBody: string, headers: KycWebhookHeaders): Promise<{ status: 'processed' | 'duplicate' | 'ignored' }> {
    if (!this.adapter || this.adapter.id !== providerId) throw new KycError(404, 'PROVIDER_NOT_FOUND', 'Unknown verification provider')

    let event: NormalizedKycEvent
    try {
      event = this.adapter.verifyWebhook(rawBody, headers)
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
        include: { user: { select: { id: true, email: true, legalName: true, countryCode: true } } },
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
        user: item.user,
        submittedAt: item.submittedAt?.toISOString() ?? null,
        resolvedAt: item.resolvedAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
      })),
      pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.max(1, Math.ceil(total / input.pageSize)) },
    }
  }

  async approveCase(adminUserId: string, caseId: string): Promise<void> {
    await this.adminDecision(adminUserId, caseId, 'APPROVED', null)
  }

  async rejectCase(adminUserId: string, caseId: string, reason: string): Promise<void> {
    const trimmed = reason.trim()
    if (trimmed.length < 3) throw new KycError(400, 'REASON_REQUIRED', 'A rejection reason is required')
    await this.adminDecision(adminUserId, caseId, 'REJECTED', trimmed.slice(0, 255))
  }

  private async adminDecision(adminUserId: string, caseId: string, status: 'APPROVED' | 'REJECTED', reason: string | null): Promise<void> {
    const kycCase = await this.prisma.kycCase.findUnique({ where: { id: caseId } })
    if (!kycCase) throw new KycError(404, 'CASE_NOT_FOUND', 'Verification case not found')
    if (!ACTIVE.includes(kycCase.status as CaseStatus)) throw new KycError(409, 'CASE_NOT_OPEN', 'This case has already been decided')
    // A second person must be involved in verifying an identity, unless this is a local test run.
    if (kycCase.userId === adminUserId && !this.config.relaxReviewChecks) {
      throw new KycError(403, 'SELF_REVIEW_NOT_ALLOWED', 'You cannot decide your own verification')
    }
    const changed = await this.decide(kycCase.id, kycCase.userId, status, reason, adminUserId)
    if (!changed) throw new KycError(409, 'CASE_NOT_OPEN', 'This case was decided while you were reviewing it')
  }

  // ------------------------------------------------------------ internals

  /** The only place a case reaches APPROVED or REJECTED. Conditional on the case still being open. */
  private async decide(caseId: string, userId: string, status: 'APPROVED' | 'REJECTED', reason: string | null, adminUserId: string | null): Promise<boolean> {
    const result = await this.prisma.kycCase.updateMany({
      where: { id: caseId, status: { in: ACTIVE } },
      data: { status, decisionReason: status === 'REJECTED' ? (reason ?? 'The identity check was not successful').slice(0, 255) : null, resolvedAt: this.now(), reviewedByUserId: adminUserId },
    })
    if (result.count !== 1) return false
    await this.audit(adminUserId ?? userId, status === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED', caseId, { subjectUserId: userId, byAdmin: adminUserId !== null, reason })
    if (status === 'APPROVED') {
      await this.safeNotify(userId, 'Identity verified', 'Your identity has been verified. Withdrawals are now available subject to the usual checks.')
    } else {
      await this.safeNotify(userId, 'Identity verification unsuccessful', 'We could not verify your identity' + (reason ? ': ' + reason : '.') + ' You can review the details and try again from your wallet.')
    }
    return true
  }

  private flows = new Map<string, KycFlow>()

  private toView(item: { id: string; status: string; documentType: string | null; decisionReason: string | null; submittedAt: Date | null; resolvedAt: Date | null; createdAt: Date }): KycCaseView {
    const open = ACTIVE.includes(item.status as CaseStatus)
    // The sandbox flow needs no stored data. A redirect URL is re-requested from the vendor in a real adapter.
    const flow = open ? (this.flows.get(item.id) ?? (this.adapter?.sandbox ? ({ kind: 'sandbox' } as const) : null)) : null
    return {
      id: item.id,
      status: item.status as CaseStatus,
      documentType: item.documentType,
      decisionReason: item.decisionReason,
      submittedAt: item.submittedAt?.toISOString() ?? null,
      resolvedAt: item.resolvedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      flow,
    }
  }

  private requirements(user: { emailVerifiedAt: Date | null; legalName: string | null; dateOfBirth: Date | null; countryCode: string | null }) {
    const age = user.dateOfBirth ? ageOn(user.dateOfBirth, this.now()) : null
    return {
      emailVerified: user.emailVerifiedAt !== null,
      missingProfile: missingProfileFields({ legalName: user.legalName, dateOfBirth: user.dateOfBirth, countryCode: user.countryCode }) as string[],
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
