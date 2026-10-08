import { env } from '../config/env.js'

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text?: string
  idempotencyKey: string
  tags?: Array<{ name: string; value: string }>
}

export class EmailService {
  async send(message: EmailMessage): Promise<{ sent: boolean; providerId: string | null }> {
    if (env.email.provider === 'disabled') return { sent: false, providerId: null }

    const response = await fetch(env.email.apiUrl + '/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + env.email.apiKey,
        'x-idempotency-key': message.idempotencyKey,
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
    await this.send({
      to,
      subject: 'Verify your SL Spot email address',
      html: this.layout('Verify your email', '<p>Thanks for creating your SL Spot account.</p><p><a href="' + link + '">Verify your email address</a></p><p>This link expires according to the verification policy shown in your account.</p>'),
      text: 'Verify your SL Spot email address: ' + link,
      idempotencyKey: 'auth-email-verification:' + token,
      tags: [{ name: 'category', value: 'email_verification' }],
    })
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = env.email.appBaseUrl + '/reset-password?token=' + encodeURIComponent(token)
    await this.send({
      to,
      subject: 'Reset your SL Spot password',
      html: this.layout('Reset your password', '<p>A password reset was requested for your SL Spot account.</p><p><a href="' + link + '">Reset your password</a></p><p>If you did not request this, you can safely ignore this email.</p>'),
      text: 'Reset your SL Spot password: ' + link,
      idempotencyKey: 'auth-password-reset:' + token,
      tags: [{ name: 'category', value: 'password_reset' }],
    })
  }

  async sendNotification(to: string, notificationId: string, title: string, body: string, category: string): Promise<void> {
    await this.send({
      to,
      subject: 'SL Spot — ' + title,
      html: this.layout(title, '<p>' + escapeHtml(body).replace(/\n/g, '<br>') + '</p><p><a href="' + env.email.appBaseUrl + '/app/alerts">Open notifications</a></p>'),
      text: body + '\n\nOpen notifications: ' + env.email.appBaseUrl + '/app/alerts',
      idempotencyKey: 'notification-email:' + notificationId,
      tags: [{ name: 'category', value: category }],
    })
  }

  private layout(title: string, body: string): string {
    return '<!doctype html><html><body style="margin:0;background:#0b0b0d;color:#f5f5f5;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:32px"><div style="font-weight:800;font-size:18px;margin-bottom:24px">SL SPOT</div><div style="background:#151518;border:1px solid #2a2a2f;border-radius:16px;padding:24px"><h1 style="font-size:22px;margin:0 0 16px">' + escapeHtml(title) + '</h1>' + body + '</div><p style="color:#8b8b94;font-size:12px;margin-top:20px">This is an automated message from SL Spot.</p></div></body></html>'
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
