import { createHmac, timingSafeEqual } from 'node:crypto'

export class WebhookSecurityError extends Error {
  readonly statusCode = 401
  readonly code = 'INVALID_WEBHOOK_SIGNATURE'
  constructor(message = 'Webhook signature is invalid') {
    super(message)
    this.name = 'WebhookSecurityError'
  }
}

function signatureFor(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(timestamp + '.' + rawBody).digest('hex')
}

export function verifyWebhookSignature(input: {
  rawBody: string
  signature: string | undefined
  timestamp: string | undefined
  secret: string
  toleranceSeconds?: number
}): void {
  const toleranceSeconds = input.toleranceSeconds ?? 300
  if (!input.signature || !input.timestamp || !/^\d{10,13}$/.test(input.timestamp)) throw new WebhookSecurityError()

  const timestampMs = Number(input.timestamp) * (input.timestamp.length === 10 ? 1000 : 1)
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > toleranceSeconds * 1000) {
    throw new WebhookSecurityError('Webhook timestamp is outside the allowed window')
  }

  const provided = input.signature.startsWith('sha256=') ? input.signature.slice(7) : input.signature
  if (!/^[a-f0-9]{64}$/i.test(provided)) throw new WebhookSecurityError()
  const expected = signatureFor(input.secret, input.timestamp, input.rawBody)
  const providedBuffer = Buffer.from(provided.toLowerCase(), 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new WebhookSecurityError()
  }
}

export function createWebhookSignature(secret: string, timestamp: string, rawBody: string): string {
  return 'sha256=' + signatureFor(secret, timestamp, rawBody)
}
