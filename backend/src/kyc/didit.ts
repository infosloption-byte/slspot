import { createHmac, timingSafeEqual } from 'node:crypto'
import {
  InvalidKycSignatureError,
  type CreateKycSessionInput,
  type CreateKycSessionResult,
  type KycOutcome,
  type KycProviderAdapter,
  type KycWebhookHeaders,
  type NormalizedKycEvent,
} from './types.js'

export type DiditConfig = {
  apiKey: string
  workflowId: string
  webhookSecret: string
  /** Where Didit sends the customer after the hosted flow. */
  callbackUrl?: string
  baseUrl?: string
  /** Webhooks older (or newer) than this many seconds are rejected. Didit documents 300. */
  toleranceSeconds?: number
  fetchImpl?: typeof fetch
  now?: () => Date
}

const DEFAULT_BASE_URL = 'https://verification.didit.me'

function header(headers: KycWebhookHeaders, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]))
  }
  return value
}

function safeEqualHex(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(actual.trim().toLowerCase(), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Didit hosted verification (API v3). The customer is redirected to Didit's page for document and selfie
 * capture, and Didit reports the verdict by signed webhook.
 *
 * Webhook signing, per Didit's documentation: HMAC-SHA256 with the webhook secret, either over the canonical
 * (sorted-key, compact) JSON in X-Signature-V2 or over the exact raw body in X-Signature, plus an X-Timestamp
 * that must be within five minutes. The deprecated X-Signature-Simple header only covers the envelope and is
 * deliberately not accepted.
 */
export class DiditProvider implements KycProviderAdapter {
  readonly id = 'didit'
  readonly displayName = 'Didit (automatic verification)'
  readonly sandbox = false
  readonly kind = 'hosted' as const

  private readonly baseUrl: string
  private readonly tolerance: number
  private readonly fetchImpl: typeof fetch
  private readonly now: () => Date

  constructor(private readonly config: DiditConfig) {
    if (!config.apiKey || !config.workflowId || !config.webhookSecret) {
      throw new Error('Didit needs an API key, a workflow id and a webhook secret')
    }
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.tolerance = config.toleranceSeconds ?? 300
    this.fetchImpl = config.fetchImpl ?? fetch
    this.now = config.now ?? (() => new Date())
  }

  async createSession(input: CreateKycSessionInput): Promise<CreateKycSessionResult> {
    const body: Record<string, unknown> = {
      workflow_id: this.config.workflowId,
      // Our case id links the vendor session back to us without sending the customer's identity details.
      vendor_data: input.caseId,
      metadata: { caseId: input.caseId },
      contact_details: { email: input.subject.email, send_notification_emails: false },
    }
    if (this.config.callbackUrl) body.callback = this.config.callbackUrl

    const response = await this.fetchImpl(this.baseUrl + '/v3/session/', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.config.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) throw new Error('Didit session request failed with status ' + response.status)
    const data = (await response.json()) as { session_id?: unknown; url?: unknown }
    if (typeof data.session_id !== 'string' || typeof data.url !== 'string') throw new Error('Didit returned an unexpected session response')
    let target: URL
    try {
      target = new URL(data.url)
    } catch {
      throw new Error('Didit returned an invalid verification link')
    }
    if (target.protocol !== 'https:') throw new Error('Didit returned a non-https verification link')
    return { providerCaseId: data.session_id, flow: { kind: 'redirect', url: target.toString() } }
  }

  verifyWebhook(rawBody: string, headers: KycWebhookHeaders): NormalizedKycEvent {
    const timestamp = Number(header(headers, 'x-timestamp'))
    if (!Number.isFinite(timestamp)) throw new InvalidKycSignatureError('Missing webhook timestamp')
    if (Math.abs(this.now().getTime() / 1000 - timestamp) > this.tolerance) throw new InvalidKycSignatureError('Webhook timestamp is outside the allowed window')

    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      throw new InvalidKycSignatureError('Webhook body is not valid JSON')
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new InvalidKycSignatureError('Webhook body is not an object')

    const sign = (text: string) => createHmac('sha256', this.config.webhookSecret).update(text, 'utf8').digest('hex')
    const v2 = header(headers, 'x-signature-v2')
    const raw = header(headers, 'x-signature')
    const valid =
      (v2 !== undefined && safeEqualHex(sign(JSON.stringify(sortKeys(payload))), v2)) ||
      (raw !== undefined && safeEqualHex(sign(rawBody), raw))
    if (!valid) throw new InvalidKycSignatureError('Webhook signature does not match')

    const sessionId = payload.session_id
    if (typeof sessionId !== 'string' || sessionId.length === 0) throw new InvalidKycSignatureError('Webhook has no session id')
    const status = typeof payload.status === 'string' ? payload.status : ''
    const webhookType = typeof payload.webhook_type === 'string' ? payload.webhook_type : 'status.updated'
    const eventId = typeof payload.event_id === 'string' && payload.event_id ? payload.event_id : [sessionId, status, String(timestamp)].join(':')

    // Only session status changes can decide a case; data or activity events never do.
    const { outcome, reason } = webhookType === 'status.updated' ? DiditProvider.mapStatus(status) : { outcome: 'pending' as KycOutcome, reason: undefined }
    return { eventId, providerCaseId: sessionId, outcome, reason }
  }

  /** Didit's session statuses are case-sensitive. Unknown ones never approve anything. */
  static mapStatus(status: string): { outcome: KycOutcome; reason?: string } {
    switch (status) {
      case 'Approved':
        return { outcome: 'approved' }
      case 'Declined':
        return { outcome: 'rejected', reason: 'The identity check was declined' }
      case 'In Review':
        return { outcome: 'review' }
      // The customer never finished, so the case would otherwise stay open forever and block a new attempt.
      case 'Abandoned':
      case 'Expired':
        return { outcome: 'rejected', reason: 'The verification was not completed in time' }
      default:
        return { outcome: 'pending' }
    }
  }
}
