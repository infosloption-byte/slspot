/**
 * The contract every payment provider implements. Everything else (state machine, ledger, limits, KYC,
 * webhooks, reconciliation) is shared and lives in PaymentService, so adding a provider means writing one
 * adapter and nothing else.
 */
export type PaymentDirection = 'deposit' | 'withdrawal'
export type PaymentKind = 'card' | 'ewallet' | 'crypto'

export type ProviderField = {
  name: string
  label: string
  type: 'text' | 'email'
  required: boolean
  placeholder?: string
  maxLength?: number
  /** Regular expression the value must match (checked on the server). */
  pattern?: string
  patternMessage?: string
}

export type ProviderCapabilities = {
  /** Stable id users and records see: `card`, `skrill`, `binance_pay`, `neteller`. */
  id: string
  displayName: string
  kind: PaymentKind
  description: string
  currencies: string[]
  deposit: boolean
  withdrawal: boolean
  minDeposit: string
  maxDeposit: string | null
  minWithdrawal: string
  maxWithdrawal: string | null
  /** Details collected from the user for a payout (account email, wallet id, ...). */
  withdrawalFields: ProviderField[]
  /** True for adapters that fake the money movement. They never exist in production. */
  sandbox: boolean
}

export type PaymentUser = { id: string; email: string; countryCode: string | null }

export type CreateDepositInput = {
  depositId: string
  amount: string
  currency: string
  user: PaymentUser
}

export type Checkout =
  | { kind: 'sandbox' }
  | { kind: 'redirect'; url: string }
  | { kind: 'instructions'; text: string }

export type CreateDepositResult = {
  providerReference: string
  checkout: Checkout
  expiresAt?: Date
}

export type PayoutInput = {
  withdrawalId: string
  amount: string
  currency: string
  details: Record<string, string>
  user: PaymentUser
}

export type PayoutResult = {
  providerReference: string
  /** COMPLETED when the provider paid out synchronously; PROCESSING when a webhook will confirm. */
  status: 'PROCESSING' | 'COMPLETED'
}

export type NormalizedEventType =
  | 'deposit.completed'
  | 'deposit.pending'
  | 'deposit.failed'
  | 'withdrawal.completed'
  | 'withdrawal.failed'

export type NormalizedEvent = {
  /** Unique per provider event; the replay guard keys on it. */
  eventId: string
  type: NormalizedEventType
  providerReference: string
  amount?: string
  currency?: string
  reason?: string
}

export type ProviderStatus = { status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; reason?: string }

export type WebhookHeaders = Record<string, string | string[] | undefined>

export class InvalidWebhookSignatureError extends Error {
  constructor(message = 'Webhook signature is invalid') {
    super(message)
    this.name = 'InvalidWebhookSignatureError'
  }
}

export interface PaymentProviderAdapter {
  readonly capabilities: ProviderCapabilities
  createDeposit(input: CreateDepositInput): Promise<CreateDepositResult>
  /** Verify the provider's signature over the raw body and return a normalized event. Throws InvalidWebhookSignatureError. */
  verifyWebhook(rawBody: string, headers: WebhookHeaders): NormalizedEvent
  getStatus(direction: PaymentDirection, providerReference: string): Promise<ProviderStatus>
  createPayout(input: PayoutInput): Promise<PayoutResult>
}

/** The provider definitively refused the payout, so the held funds can safely go back to the user. */
export class PayoutRejectedError extends Error {
  constructor(message = 'The payout was declined by the provider') {
    super(message)
    this.name = 'PayoutRejectedError'
  }
}
