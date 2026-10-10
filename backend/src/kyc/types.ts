/**
 * Contract every identity-verification vendor implements. The shared KycService owns eligibility, the case
 * state machine, replay protection, admin review and notifications, so adding a vendor means writing one adapter.
 *
 * Privacy: the vendor hosts document and selfie capture. SL Spot stores only the case, its status and the
 * vendor's reference. Document images and numbers never enter this codebase.
 */
export const KYC_DOCUMENT_TYPES = ['passport', 'national_id', 'driving_licence'] as const
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number]

export type KycSubject = {
  userId: string
  email: string
  legalName: string
  dateOfBirth: string
  countryCode: string
}

export type KycFlow =
  | { kind: 'sandbox' }
  | { kind: 'redirect'; url: string }

export type CreateKycSessionInput = {
  caseId: string
  documentType: KycDocumentType
  subject: KycSubject
}

export type CreateKycSessionResult = { providerCaseId: string; flow: KycFlow }

export type KycOutcome = 'approved' | 'rejected' | 'review' | 'pending'

export type NormalizedKycEvent = {
  eventId: string
  providerCaseId: string
  outcome: KycOutcome
  reason?: string
}

export type KycWebhookHeaders = Record<string, string | string[] | undefined>

export class InvalidKycSignatureError extends Error {
  constructor(message = 'KYC webhook signature is invalid') {
    super(message)
    this.name = 'InvalidKycSignatureError'
  }
}

export interface KycProviderAdapter {
  readonly id: string
  readonly displayName: string
  /** True for adapters that fake the identity check. They never exist in production. */
  readonly sandbox: boolean
  createSession(input: CreateKycSessionInput): Promise<CreateKycSessionResult>
  /** Verify the vendor's signature over the raw body and return a normalized event. Throws InvalidKycSignatureError. */
  verifyWebhook(rawBody: string, headers: KycWebhookHeaders): NormalizedKycEvent
}
