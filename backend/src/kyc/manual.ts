import {
  InvalidKycSignatureError,
  type CreateKycSessionInput,
  type CreateKycSessionResult,
  type KycProviderAdapter,
  type NormalizedKycEvent,
} from './types.js'

/**
 * Manual review: the customer uploads documents to SL Spot and an administrator decides.
 * There is no vendor, so there are no webhooks and nothing to sign. All state changes go through the
 * KycService upload, submit and admin decision paths.
 */
export class ManualKycProvider implements KycProviderAdapter {
  readonly id = 'manual'
  readonly displayName = 'Upload documents for manual review'
  readonly sandbox = false
  readonly kind = 'manual' as const

  async createSession(input: CreateKycSessionInput): Promise<CreateKycSessionResult> {
    return { providerCaseId: 'manual_' + input.caseId, flow: { kind: 'upload' } }
  }

  verifyWebhook(): NormalizedKycEvent {
    throw new InvalidKycSignatureError('Manual verification does not receive webhooks')
  }
}
