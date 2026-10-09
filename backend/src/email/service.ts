import { randomUUID } from 'node:crypto'
import { env } from '../config/env.js'
import {
  classifyNotificationTemplate,
  renderEmailTemplate,
  type EmailDetail,
  type EmailTemplateKey,
} from './templates.js'

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text?: string
  idempotencyKey: string
  templateKey?: EmailTemplateKey
  tags?: Array<{ name: string; value: string }>
}

export type EmailPreviewRecord = {
  id: string
  capturedAt: string
  to: string
  subject: string
  html: string
  text: string | null
  templateKey: EmailTemplateKey | null
  category: string | null
}

const MAX_PREVIEW_OUTBOX = 250
const previewOutbox: EmailPreviewRecord[] = []

function capturePreview(message: EmailMessage): EmailPreviewRecord {
  const record: EmailPreviewRecord = {
    id: randomUUID(),
    capturedAt: new Date().toISOString(),
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text ?? null,
    templateKey: message.templateKey ?? null,
    category: message.tags?.find((tag) => tag.name === 'category')?.value ?? null,
  }
  previewOutbox.unshift(record)
  if (previewOutbox.length > MAX_PREVIEW_OUTBOX) previewOutbox.length = MAX_PREVIEW_OUTBOX
  return record
}

export function listEmailPreviewMessages(): Array<Omit<EmailPreviewRecord, 'html' | 'text'>> {
  return previewOutbox.map((message) => ({
    id: message.id,
    capturedAt: message.capturedAt,
    to: message.to,
    subject: message.subject,
    templateKey: message.templateKey,
    category: message.category,
  }))
}

export function getEmailPreviewMessage(id: string): EmailPreviewRecord | null {
  return previewOutbox.find((message) => message.id === id) ?? null
}

export class EmailService {
  async send(message: EmailMessage): Promise<{ sent: boolean; providerId: string | null }> {
    if (env.email.provider === 'disabled') {
      if (env.nodeEnv === 'development') {
        const preview = capturePreview(message)
        return { sent: false, providerId: 'preview:' + preview.id }
      }
      return { sent: false, providerId: null }
    }

    const response = await fetch(env.email.apiUrl + '/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + env.email.apiKey,
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: env.email.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.text ? { text: message.text } : {}),
        ...(message.tags?.length ? { tags: message.tags } : {}),
      }),
      signal: AbortSignal.timeout(env.email.requestTimeoutMs),
    })

    const body = await response.text()
    if (!response.ok) {
      throw new Error('Email provider request failed (' + response.status + '): ' + body.slice(0, 500))
    }

    try {
      const parsed = JSON.parse(body) as { id?: unknown }
      return { sent: true, providerId: typeof parsed.id === 'string' ? parsed.id : null }
    } catch {
      return { sent: true, providerId: null }
    }
  }

  async sendVerification(to: string, token: string): Promise<void> {
    const link = env.email.appBaseUrl + '/verify-email?token=' + encodeURIComponent(token)
    const rendered = renderEmailTemplate('email-verification', { actionUrl: link })
    await this.send({
      to,
      ...rendered,
      idempotencyKey: 'auth-email-verification:' + token,
      tags: [{ name: 'category', value: 'email_verification' }],
    })
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = env.email.appBaseUrl + '/reset-password?token=' + encodeURIComponent(token)
    const rendered = renderEmailTemplate('password-reset', { actionUrl: link })
    await this.send({
      to,
      ...rendered,
      idempotencyKey: 'auth-password-reset:' + token,
      tags: [{ name: 'category', value: 'password_reset' }],
    })
  }

  async sendNotification(to: string, notificationId: string, title: string, body: string, category: string, details?: EmailDetail[]): Promise<{ sent: boolean; providerId: string | null }> {
    const templateKey = classifyNotificationTemplate(category, title, body)
    const rendered = renderEmailTemplate(templateKey, {
      subject: 'SL Spot — ' + title,
      heading: title,
      preheader: body,
      body,
      details: details ?? [],
    })
    return this.send({
      to,
      ...rendered,
      idempotencyKey: 'notification-email:' + notificationId,
      tags: [{ name: 'category', value: category }, { name: 'template', value: templateKey }],
    })
  }
}
