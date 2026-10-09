import { apiClient } from '../api/client'
import type { ApiSuccess } from '../api/contracts'

export type PolicyType =
  | 'TERMS_AND_CONDITIONS'
  | 'PRIVACY_POLICY'
  | 'TRADING_RULES'
  | 'PAYMENT_POLICY'
  | 'RETURN_REFUND_POLICY'
  | 'AML_KYC_POLICY'
  | 'COOKIE_POLICY'
  | 'CARDHOLDER_AGREEMENT'

export type PublicPolicy = {
  type: PolicyType
  slug: string
  title: string
  requiredAtRegistration: boolean
  version: string
  status: 'DRAFT' | 'ACTIVE'
}

export type CurrentPolicyCatalogue = {
  status: 'DRAFT' | 'ACTIVE'
  draftNotice: string
  registrationRequired: PolicyType[]
  policies: PublicPolicy[]
}

export async function getCurrentPolicies(): Promise<CurrentPolicyCatalogue> {
  const response = await apiClient.get<ApiSuccess<CurrentPolicyCatalogue>>('/policies/current')
  return response.data
}
