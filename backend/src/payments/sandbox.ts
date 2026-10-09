import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  InvalidWebhookSignatureError,
  type CreateDepositInput,
  type CreateDepositResult,
  type NormalizedEvent,
  type PaymentDirection,
  type PaymentKind,
  type PaymentProviderAdapter,
  type PayoutInput,
  type PayoutResult,
  type ProviderCapabilities,
  type ProviderField,
  type ProviderStatus,
  type WebhookHeaders,
} from './types.js'

export const SANDBOX_SIGNATURE_HEADER = 'x-sandbox-signature'

export type SandboxOutcome = 'succeed' | 'fail' | 'pending'

type SandboxProfile = {
  id: string
  displayName: string
  kind: PaymentKind
  description: string
  withdrawalFields: ProviderField[]
}

/** The four providers the platform plans to offer, with the payout details each one will need. */
export const SANDBOX_PROFILES: SandboxProfile[] = [
  {
    id: 'card',
    displayName: 'Credit / debit card',
    kind: 'card',
    description: 'Visa and Mastercard through a hosted card page.',
    withdrawalFields: [
      { name: 'cardHolder', label: 'Card holder name', type: 'text', required: true, maxLength: 80 },
      { name: 'cardLast4', label: 'Last 4 digits of the card', type: 'text', required: true, maxLength: 4, pattern: '^\\d{4}$', patternMessage: 'Enter the last 4 digits' },
    ],
  },
  {
    id: 'skrill',
    displayName: 'Skrill',
    kind: 'ewallet',
    description: 'Pay from your Skrill wallet.',
    withdrawalFields: [
      { name: 'email', label: 'Skrill account email', type: 'email', required: true, maxLength: 191, placeholder: 'you@example.com' },
    ],
  },
  {
    id: 'neteller',
    displayName: 'Neteller',
    kind: 'ewallet',
    description: 'Pay from your Neteller wallet.',
    withdrawalFields: [
      { name: 'email', label: 'Neteller account email', type: 'email', required: true, maxLength: 191, placeholder: 'you@example.com' },
    ],
  },
  {
    id: 'binance_pay',
    displayName: 'Binance Pay',
    kind: 'crypto',
    description: 'Pay with crypto through Binance Pay.',
    withdrawalFields: [
      { name: 'binancePayId', label: 'Binance Pay ID', type: 'text', required: true, maxLength: 32, pattern: '^[0-9]{6,20}$', patternMessage: 'Enter your numeric Binance Pay ID' },
    ],
  },
]

/**
 * Stand-in for a real provider. It never moves money: createDeposit hands back a "sandbox" checkout and the
 * outcome is chosen by the tester. The outcome travels as a signed webhook through the same verification,
 * replay-guard and ledger path a real provider would use, so only this file changes when a real adapter
 * replaces it.
 */
export class SandboxProvider implements PaymentProviderAdapter {
  readonly capabilities: ProviderCapabilities
  private readonly references = new Map<string, { direction: PaymentDirection; status: ProviderStatus['status'] }>()

  constructor(profile: SandboxProfile, private readonly secret: string) {
    this.capabilities = {
      id: profile.id,
      displayName: profile.displayName,
      kind: profile.kind,
      description: profile.description + ' (sandbox: no real money moves)',
      currencies: ['USD'],
      deposit: true,
      withdrawal: true,
      minDeposit: '10',
      maxDeposit: '50000',
      minWithdrawal: '10',
      maxWithdrawal: '50000',
      withdrawalFields: profile.withdrawalFields,
      sandbox: true,
    }
  }

  async createDeposit(input: CreateDepositInput): Promise<CreateDepositResult> {
    const providerReference = 'sbx_dep_' + input.depositId
    this.references.set(providerReference, { direction: 'deposit', status: 'PENDING' })
    return { providerReference, checkout: { kind: 'sandbox' } }
  }

  async createPayout(input: PayoutInput): Promise<PayoutResult> {
    // The sandbox "pays" instantly: this is the stage where a real provider would move the money.
    const providerReference = 'sbx_wd_' + input.withdrawalId
    this.references.set(providerReference, { direction: 'withdrawal', status: 'COMPLETED' })
    return { providerReference, status: 'COMPLETED' }
  }

  async getStatus(direction: PaymentDirection, providerReference: string): Promise<ProviderStatus> {
    const known = this.references.get(providerReference)
    if (!known || known.direction !== direction) return { status: 'PENDING' }
    return { status: known.status }
  }

  /** Build the signed webhook a real provider would send for the outcome the tester picked. */
  simulate(providerReference: string, outcome: SandboxOutcome, amount: string, currency: string): { rawBody: string; headers: WebhookHeaders } {
    const type = outcome === 'succeed' ? 'deposit.completed' : outcome === 'fail' ? 'deposit.failed' : 'deposit.pending'
    this.references.set(providerReference, {
      direction: 'deposit',
      status: outcome === 'succeed' ? 'COMPLETED' : outcome === 'fail' ? 'FAILED' : 'PROCESSING',
    })
    const rawBody = JSON.stringify({
      id: 'sbx_evt_' + randomUUID(),
      type,
      reference: providerReference,
      amount,
      currency,
      reason: outcome === 'fail' ? 'Declined in sandbox' : undefined,
    })
    return { rawBody, headers: { [SANDBOX_SIGNATURE_HEADER]: this.sign(rawBody) } }
  }

  verifyWebhook(rawBody: string, headers: WebhookHeaders): NormalizedEvent {
    const header = headers[SANDBOX_SIGNATURE_HEADER]
    const signature = Array.isArray(header) ? header[0] : header
    if (!signature) throw new InvalidWebhookSignatureError('Missing webhook signature')
    const expected = Buffer.from(this.sign(rawBody), 'hex')
    const provided = Buffer.from(signature, 'hex')
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) throw new InvalidWebhookSignatureError()

    let body: { id?: unknown; type?: unknown; reference?: unknown; amount?: unknown; currency?: unknown; reason?: unknown }
    try {
      body = JSON.parse(rawBody) as typeof body
    } catch {
      throw new InvalidWebhookSignatureError('Webhook body is not valid JSON')
    }
    const types = ['deposit.completed', 'deposit.pending', 'deposit.failed', 'withdrawal.completed', 'withdrawal.failed'] as const
    const type = types.find((item) => item === body.type)
    if (typeof body.id !== 'string' || !type || typeof body.reference !== 'string') {
      throw new InvalidWebhookSignatureError('Webhook payload is malformed')
    }
    return {
      eventId: body.id,
      type,
      providerReference: body.reference,
      amount: typeof body.amount === 'string' ? body.amount : undefined,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
      reason: typeof body.reason === 'string' ? body.reason : undefined,
    }
  }

  private sign(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex')
  }
}

export function createSandboxProviders(secret: string): SandboxProvider[] {
  return SANDBOX_PROFILES.map((profile) => new SandboxProvider(profile, secret))
}
