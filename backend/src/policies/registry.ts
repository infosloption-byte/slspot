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
    source: 'REGISTRATION',
  }))
}
