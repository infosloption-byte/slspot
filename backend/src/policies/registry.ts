export const CURRENT_POLICY_VERSIONS = {
  TERMS_AND_CONDITIONS: '2026-10',
  PRIVACY_POLICY: '2026-10',
  TRADING_RULES: '2026-10',
  PAYMENT_POLICY: '2026-10',
  RETURN_REFUND_POLICY: '2026-10',
  AML_KYC_POLICY: '2026-10',
  COOKIE_POLICY: '2026-10',
  CARDHOLDER_AGREEMENT: '2026-10',
} as const

export type PolicyType = keyof typeof CURRENT_POLICY_VERSIONS

export const POLICY_DEFINITIONS = [
  { type: 'TERMS_AND_CONDITIONS', slug: 'terms', title: 'Terms & Conditions', requiredAtRegistration: true },
  { type: 'PRIVACY_POLICY', slug: 'privacy', title: 'Privacy Policy', requiredAtRegistration: true },
  { type: 'TRADING_RULES', slug: 'trading-rules', title: 'Trading Rules & Risk Disclosure', requiredAtRegistration: false },
  { type: 'PAYMENT_POLICY', slug: 'payments', title: 'Payment Policy', requiredAtRegistration: false },
  { type: 'RETURN_REFUND_POLICY', slug: 'returns-refunds', title: 'Returns, Refunds & Withdrawals', requiredAtRegistration: false },
  { type: 'AML_KYC_POLICY', slug: 'aml-kyc', title: 'AML & KYC Policy', requiredAtRegistration: false },
  { type: 'COOKIE_POLICY', slug: 'cookies', title: 'Cookie Policy', requiredAtRegistration: false },
  { type: 'CARDHOLDER_AGREEMENT', slug: 'cardholder', title: 'Cardholder Agreement', requiredAtRegistration: false },
] as const satisfies ReadonlyArray<{
  type: PolicyType
  slug: string
  title: string
  requiredAtRegistration: boolean
}>

export const REGISTRATION_POLICY_TYPES = [
  'TERMS_AND_CONDITIONS',
  'PRIVACY_POLICY',
] as const satisfies readonly PolicyType[]

export function buildRegistrationPolicyAcceptanceRows(userId: string, acceptedAt: Date) {
  return REGISTRATION_POLICY_TYPES.map((policyType) => ({
    userId,
    policyType,
    version: CURRENT_POLICY_VERSIONS[policyType],
    acceptedAt,
    source: policyType === 'PRIVACY_POLICY' ? 'REGISTRATION_NOTICE' : 'REGISTRATION',
  }))
}
