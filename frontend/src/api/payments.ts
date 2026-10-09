import { apiClient } from './client'
import type { ApiSuccess } from './contracts'

export type PaymentDirection = 'deposit' | 'withdrawal'
export type PaymentField = {
  name: string
  label: string
  type: 'text' | 'email'
  required: boolean
  placeholder?: string
  maxLength?: number
  pattern?: string
  patternMessage?: string
}
export type PaymentMethod = {
  id: string
  displayName: string
  kind: 'card' | 'ewallet' | 'crypto' | string
  description: string
  currencies: string[]
  minAmount: string
  maxAmount: string | null
  sandbox: boolean
  fields: PaymentField[]
  eligible: boolean
  reason?: string
}
export type PaymentBlocker = { code: string; message: string }
export type PaymentEligibility = {
  tier: 0 | 1 | 2
  emailVerified: boolean
  profile: { legalName: string | null; dateOfBirth: string | null; countryCode: string | null }
  missingProfile: string[]
  twoFactorEnabled: boolean
  kycStatus: string
  depositBlockers: PaymentBlocker[]
  withdrawalBlockers: PaymentBlocker[]
  sandbox: boolean
}
export type PaymentCheckout =
  | { kind: 'sandbox' }
  | { kind: 'redirect'; url: string }
  | { kind: 'instructions'; text: string }
export type PaymentDeposit = {
  id: string
  provider: string
  status: string
  amount: string
  currency: string
  providerReference: string | null
  checkout: PaymentCheckout | null
  expiresAt: string | null
  failureReason: string | null
  requestedAt: string
  completedAt: string | null
}
export type PaymentWithdrawal = {
  id: string
  provider: string
  status: string
  amount: string
  currency: string
  destination: string | null
  needsReview: boolean
  failureReason: string | null
  requestedAt: string
  completedAt: string | null
}

function data<T>(response: ApiSuccess<T>): T {
  return response.data
}

export const paymentApi = {
  eligibility: () =>
    apiClient.get<ApiSuccess<PaymentEligibility>>('/payments/eligibility').then(data),

  methods: (direction: PaymentDirection) =>
    apiClient.get<ApiSuccess<PaymentMethod[]>>('/payments/methods?direction=' + direction).then(data),

  createDeposit: (input: { provider: string; amount: string; clientRequestId: string }) =>
    apiClient.post<ApiSuccess<PaymentDeposit>>('/payments/deposits', input, {
      idempotencyKey: input.clientRequestId,
    }).then(data),

  getDeposit: (id: string) =>
    apiClient.get<ApiSuccess<PaymentDeposit>>('/payments/deposits/' + encodeURIComponent(id)).then(data),

  cancelDeposit: (id: string) =>
    apiClient.post<ApiSuccess<PaymentDeposit>>('/payments/deposits/' + encodeURIComponent(id) + '/cancel').then(data),

  sandboxDepositOutcome: (id: string, outcome: 'succeed' | 'fail' | 'pending') =>
    apiClient.post<ApiSuccess<PaymentDeposit>>('/payments/sandbox/deposits/' + encodeURIComponent(id) + '/outcome', { outcome }).then(data),

  createWithdrawal: (input: { provider: string; amount: string; details: Record<string, string>; clientRequestId: string }) =>
    apiClient.post<ApiSuccess<PaymentWithdrawal>>('/payments/withdrawals', input, {
      idempotencyKey: input.clientRequestId,
    }).then(data),

  getWithdrawal: (id: string) =>
    apiClient.get<ApiSuccess<PaymentWithdrawal>>('/payments/withdrawals/' + encodeURIComponent(id)).then(data),

  cancelWithdrawal: (id: string) =>
    apiClient.post<ApiSuccess<PaymentWithdrawal>>('/payments/withdrawals/' + encodeURIComponent(id) + '/cancel').then(data),
}
