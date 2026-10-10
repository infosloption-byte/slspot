import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  InvalidKycSignatureError,
  type CreateKycSessionInput,
  type CreateKycSessionResult,
  type KycOutcome,
  type KycProviderAdapter,
  type KycWebhookHeaders,
  type NormalizedKycEvent,
} from './types.js'

export const KYC_SANDBOX_SIGNATURE_HEADER = 'x-sandbox-signature'

/** Development-only vendor: the tester picks the verdict. Signed exactly like a real vendor webhook. */
export class KycSandboxProvider implements KycProviderAdapter {
  readonly id = 'sandbox'
  readonly displayName = 'Sandbox verification'
  readonly sandbox = true

  constructor(private readonly secret: string) {
    if (!secret) throw new Error('A KYC sandbox webhook secret is required')
  }

  private sign(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex')
  }

  async createSession(input: CreateKycSessionInput): Promise<CreateKycSessionResult> {
    return { providerCaseId: 'sbx_kyc_' + input.caseId, flow: { kind: 'sandbox' } }
  }

  /** Build the signed webhook a real vendor would send for the verdict the tester picked. */
  simulate(providerCaseId: string, outcome: KycOutcome, reason?: string): { rawBody: string; headers: KycWebhookHeaders } {
    const rawBody = JSON.stringify({
      id: 'sbx_kyc_evt_' + randomUUID(),
      case: providerCaseId,
      outcome,
      reason: reason ?? (outcome === 'rejected' ? 'Rejected in sandbox' : undefined),
    })
    return { rawBody, headers: { [KYC_SANDBOX_SIGNATURE_HEADER]: this.sign(rawBody) } }
  }

  verifyWebhook(rawBody: string, headers: KycWebhookHeaders): NormalizedKycEvent {
    const header = headers[KYC_SANDBOX_SIGNATURE_HEADER]
    const signature = Array.isArray(header) ? header[0] : header
    if (!signature) throw new InvalidKycSignatureError('Missing webhook signature')
    const expected = Buffer.from(this.sign(rawBody), 'hex')
    const provided = Buffer.from(signature, 'hex')
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new InvalidKycSignatureError()

    let body: { id?: unknown; case?: unknown; outcome?: unknown; reason?: unknown }
    try {
      body = JSON.parse(rawBody) as typeof body
    } catch {
      throw new InvalidKycSignatureError('Webhook body is not valid JSON')
    }
    const outcomes: KycOutcome[] = ['approved', 'rejected', 'review', 'pending']
    if (typeof body.id !== 'string' || typeof body.case !== 'string' || !outcomes.includes(body.outcome as KycOutcome)) {
      throw new InvalidKycSignatureError('Webhook body is malformed')
    }
    return {
      eventId: body.id,
      providerCaseId: body.case,
      outcome: body.outcome as KycOutcome,
      reason: typeof body.reason === 'string' ? body.reason.slice(0, 255) : undefined,
    }
  }
}
