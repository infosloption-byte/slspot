import { apiClient } from './client'
import type { ApiSuccess } from './contracts'

export type KycCaseStatus = 'NOT_STARTED' | 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED'
export type KycDocumentType = 'passport' | 'national_id' | 'driving_licence'
export type KycSandboxOutcome = 'approved' | 'rejected' | 'review'

export type KycStatus = {
  status: KycCaseStatus
  case: {
    id: string
    status: KycCaseStatus
    documentType: string | null
    decisionReason: string | null
    submittedAt: string | null
    resolvedAt: string | null
    createdAt: string
    flow: { kind: 'sandbox' } | { kind: 'redirect'; url: string } | null
  } | null
  provider: { id: string; displayName: string; sandbox: boolean } | null
  documentTypes: KycDocumentType[]
  requirements: { emailVerified: boolean; missingProfile: string[]; ageOk: boolean }
  attemptsUsed: number
  maxAttempts: number
  canStart: boolean
  blockedReason: string | null
}

function data<T>(response: ApiSuccess<T>): T {
  return response.data
}

export const kycApi = {
  status: () => apiClient.get<ApiSuccess<KycStatus>>('/kyc/status').then(data),
  start: (documentType: KycDocumentType) => apiClient.post<ApiSuccess<KycStatus>>('/kyc/start', { documentType }).then(data),
  sandboxOutcome: (outcome: KycSandboxOutcome) => apiClient.post<ApiSuccess<KycStatus>>('/kyc/sandbox/outcome', { outcome }).then(data),
}
