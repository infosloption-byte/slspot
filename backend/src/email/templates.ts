import { env } from '../config/env.js'

export const EMAIL_TEMPLATE_KEYS = [
  'email-verification',
  'password-reset',
  'password-changed',
  'login-alert',
  'deposit-success',
  'deposit-failed',
  'withdrawal-request',
  'withdrawal-success',
  'withdrawal-failed',
  'trade-result',
  'security-alert',
  'support-update',
  'system-announcement',
  'generic-notification',
] as const

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number]

export type EmailDetail = { label: string; value: string }

export type EmailTemplateOverrides = {
  to?: string
  subject?: string
  heading?: string
  preheader?: string
  body?: string
  details?: EmailDetail[]
  actionLabel?: string | null
  actionUrl?: string | null
}

export type RenderedEmail = {
  subject: string
  html: string
  text: string
  templateKey: EmailTemplateKey
}

type TemplateSpec = {
  label: string
  category: string
  subject: string
  heading: string
  preheader: string
  body: string
  details: EmailDetail[]
  actionLabel: string | null
  actionPath: string | null
}

const specs: Record<EmailTemplateKey, TemplateSpec> = {
  'email-verification': {
    label: 'Verify email address',
    category: 'Account',
    subject: 'Verify your SL Spot email address',
    heading: 'Verify your email',
    preheader: 'Confirm your email address to secure your SL Spot account.',
    body: 'Thanks for creating a SL Spot account. Confirm this email address to complete account verification. If you did not create this account, you can ignore this message.',
    details: [{ label: 'Request', value: 'Email address verification' }, { label: 'Validity', value: 'Use the link before it expires' }],
    actionLabel: 'Verify email address',
    actionPath: '/verify-email',
  },
  'password-reset': {
    label: 'Password reset request',
    category: 'Account security',
    subject: 'Reset your SL Spot password',
    heading: 'Reset your password',
    preheader: 'A password reset was requested for your SL Spot account.',
    body: 'We received a request to reset your SL Spot password. Use the button below to choose a new password. If you did not make this request, ignore this email and your existing password will remain unchanged.',
    details: [{ label: 'Request', value: 'Password reset' }, { label: 'Security', value: 'The reset link is time-limited and can only be used once' }],
    actionLabel: 'Reset password',
    actionPath: '/reset-password',
  },
  'password-changed': {
    label: 'Password changed',
    category: 'Account security',
    subject: 'Your SL Spot password was changed',
    heading: 'Password changed',
    preheader: 'Your SL Spot account password was updated.',
    body: 'The password for your SL Spot account was changed successfully. If you made this change, no action is needed. If you do not recognize it, secure your account immediately and contact support.',
    details: [{ label: 'Event', value: 'Password changed' }, { label: 'Recommended action', value: 'Review your active sessions if this was not you' }],
    actionLabel: 'Review account security',
    actionPath: '/app/security',
  },
  'login-alert': {
    label: 'New sign-in alert',
    category: 'Account security',
    subject: 'New sign-in to your SL Spot account',
    heading: 'New sign-in detected',
    preheader: 'A sign-in event was recorded for your account.',
    body: 'A sign-in to your SL Spot account was recorded. If this was you, you can ignore this message. If it was not you, change your password and review active sessions.',
    details: [{ label: 'Event', value: 'Successful sign-in' }, { label: 'Recommended action', value: 'Review active sessions if this sign-in is unfamiliar' }],
    actionLabel: 'Review security',
    actionPath: '/app/security',
  },
  'deposit-success': {
    label: 'Deposit successful',
    category: 'Wallet',
    subject: 'Your SL Spot deposit was successful',
    heading: 'Deposit successful',
    preheader: 'Your deposit has been credited to your wallet.',
    body: 'Your deposit was completed successfully. The transaction details are included below for your records.',
    details: [{ label: 'Amount', value: '250.00 USD' }, { label: 'Wallet', value: 'Demo wallet' }, { label: 'Reference', value: 'DEMO-DEP-82A4' }, { label: 'Status', value: 'Completed' }],
    actionLabel: 'View wallet activity',
    actionPath: '/app/wallet',
  },
  'deposit-failed': {
    label: 'Deposit failed',
    category: 'Wallet',
    subject: 'Your SL Spot deposit needs attention',
    heading: 'Deposit not completed',
    preheader: 'A deposit could not be completed.',
    body: 'We could not complete this deposit. The amount has not been confirmed as credited. Check the transaction status in your account before trying again.',
    details: [{ label: 'Amount', value: '250.00 USD' }, { label: 'Reference', value: 'DEMO-DEP-82A4' }, { label: 'Status', value: 'Failed' }],
    actionLabel: 'Review wallet activity',
    actionPath: '/app/wallet',
  },
  'withdrawal-request': {
    label: 'Withdrawal request received',
    category: 'Wallet',
    subject: 'We received your SL Spot withdrawal request',
    heading: 'Withdrawal request received',
    preheader: 'Your withdrawal request has been recorded.',
    body: 'We received your withdrawal request. We will update you when its status changes. Do not share your password or verification codes with anyone claiming to process this request.',
    details: [{ label: 'Amount', value: '75.00 USD' }, { label: 'Destination', value: 'Demo destination' }, { label: 'Reference', value: 'DEMO-WD-39B1' }, { label: 'Status', value: 'Request received' }],
    actionLabel: 'View wallet activity',
    actionPath: '/app/wallet',
  },
  'withdrawal-success': {
    label: 'Withdrawal successful',
    category: 'Wallet',
    subject: 'Your SL Spot withdrawal was completed',
    heading: 'Withdrawal completed',
    preheader: 'Your withdrawal was completed successfully.',
    body: 'Your withdrawal has been completed. Keep this message for your records and review the reference below if you contact support.',
    details: [{ label: 'Amount', value: '75.00 USD' }, { label: 'Destination', value: 'Demo destination' }, { label: 'Reference', value: 'DEMO-WD-39B1' }, { label: 'Status', value: 'Completed' }],
    actionLabel: 'View wallet activity',
    actionPath: '/app/wallet',
  },
  'withdrawal-failed': {
    label: 'Withdrawal failed or rejected',
    category: 'Wallet',
    subject: 'Your SL Spot withdrawal needs attention',
    heading: 'Withdrawal not completed',
    preheader: 'Your withdrawal could not be completed.',
    body: 'Your withdrawal was not completed. Review the status and reason in your account. If funds were reserved for this request, check your wallet activity for the resulting adjustment.',
    details: [{ label: 'Amount', value: '75.00 USD' }, { label: 'Reference', value: 'DEMO-WD-39B1' }, { label: 'Status', value: 'Failed or rejected' }],
    actionLabel: 'Review wallet activity',
    actionPath: '/app/wallet',
  },
  'trade-result': {
    label: 'Trade result',
    category: 'Trading',
    subject: 'Your SL Spot trade result is available',
    heading: 'Trade result',
    preheader: 'A trade has been settled and its result is available.',
    body: 'Your trade has been settled. Review the result and recorded profit or loss in your trade history.',
    details: [{ label: 'Market', value: 'BTC/USD' }, { label: 'Direction', value: 'UP' }, { label: 'Stake', value: '50.00 USD' }, { label: 'Result', value: 'WON' }, { label: 'Net P&L', value: '+44.00 USD' }],
    actionLabel: 'View trade history',
    actionPath: '/app/history',
  },
  'security-alert': {
    label: 'Security alert',
    category: 'Account security',
    subject: 'Security notice for your SL Spot account',
    heading: 'Account security notice',
    preheader: 'There is an account security update for you to review.',
    body: 'We recorded a security-related event on your SL Spot account. If you recognize this activity, no action is needed. If you do not recognize it, review your sessions and secure your account.',
    details: [{ label: 'Event', value: 'Security activity recorded' }, { label: 'Recommended action', value: 'Check active sessions and account settings' }],
    actionLabel: 'Review account security',
    actionPath: '/app/security',
  },
  'support-update': {
    label: 'Support ticket update',
    category: 'Support',
    subject: 'There is an update to your SL Spot support ticket',
    heading: 'Support ticket update',
    preheader: 'The support team updated your request.',
    body: 'There is a new update on your support ticket. Open your support inbox to read the conversation and reply if more information is needed.',
    details: [{ label: 'Ticket', value: 'SLSPOT-1042' }, { label: 'Status', value: 'Waiting for your reply' }],
    actionLabel: 'Open support inbox',
    actionPath: '/app/support',
  },
  'system-announcement': {
    label: 'System announcement',
    category: 'Platform updates',
    subject: 'An update from SL Spot',
    heading: 'Platform announcement',
    preheader: 'There is a platform update for your account.',
    body: 'We have an update to share with you. Read the announcement below and open the notification center for the latest platform information.',
    details: [],
    actionLabel: 'View notifications',
    actionPath: '/app/alerts',
  },
  'generic-notification': {
    label: 'General notification',
    category: 'Account activity',
    subject: 'A new notification from SL Spot',
    heading: 'Account notification',
    preheader: 'There is a new notification for your SL Spot account.',
    body: 'A new update is available in your account. Open SL Spot to see the latest information.',
    details: [],
    actionLabel: 'Open notifications',
    actionPath: '/app/alerts',
  },
}

const sampleRecipient = 'trader@example.com'

export function getEmailTemplateSamples(): Array<{ key: EmailTemplateKey; label: string; category: string; subject: string; recipient: string; html: string; text: string }> {
  return EMAIL_TEMPLATE_KEYS.map((key) => {
    const rendered = renderEmailTemplate(key)
    return {
      key,
      label: specs[key].label,
      category: specs[key].category,
      subject: rendered.subject,
      recipient: sampleRecipient,
      html: rendered.html,
      text: rendered.text,
    }
  })
}

export function isEmailTemplateKey(value: string): value is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(value)
}

export function classifyNotificationTemplate(category: string, title: string, body: string): EmailTemplateKey {
  const normalizedCategory = category.toLowerCase().replace(/[^a-z]/g, '')
  const searchable = (title + ' ' + body).toLowerCase()

  if (normalizedCategory.includes('deposit')) {
    if (/fail|reject|declin|not completed|could not/.test(searchable)) return 'deposit-failed'
    return 'deposit-success'
  }
  if (normalizedCategory.includes('withdrawal') || normalizedCategory.includes('wallet')) {
    if (/fail|reject|declin|not completed|not sent|could not|refunded|returned to your wallet|cancel/.test(searchable)) return 'withdrawal-failed'
    if (/request|received|processing|pending/.test(searchable) && !/complete|success|completed/.test(searchable)) return 'withdrawal-request'
    if (/completed|success|paid/.test(searchable)) return 'withdrawal-success'
    return 'withdrawal-request'
  }
  if (normalizedCategory.includes('traderesult') || normalizedCategory.includes('trade')) return 'trade-result'
  if (normalizedCategory.includes('security') || normalizedCategory.includes('password') || normalizedCategory.includes('login')) {
    if (/password.{0,20}changed/.test(searchable)) return 'password-changed'
    if (/new sign.?in|login/.test(searchable)) return 'login-alert'
    return 'security-alert'
  }
  if (normalizedCategory.includes('support')) return 'support-update'
  if (normalizedCategory.includes('system') || normalizedCategory.includes('announcement')) return 'system-announcement'
  return 'generic-notification'
}

export function renderEmailTemplate(key: EmailTemplateKey, overrides: EmailTemplateOverrides = {}): RenderedEmail {
  const spec = specs[key]
  const subject = overrides.subject ?? spec.subject
  const heading = overrides.heading ?? spec.heading
  const preheader = overrides.preheader ?? spec.preheader
  const body = overrides.body ?? spec.body
  const details = overrides.details ?? spec.details
  const actionLabel = overrides.actionLabel === undefined ? spec.actionLabel : overrides.actionLabel
  const actionUrl = overrides.actionUrl === undefined
    ? (spec.actionPath ? env.email.appBaseUrl + spec.actionPath : null)
    : overrides.actionUrl
  const titleSafe = escapeHtml(heading)
  const subjectSafe = escapeHtml(subject)
  const htmlBody = body.split(/\n{2,}/).map((paragraph) => '<p style="margin:0 0 14px;color:#c6c6ce;font-size:15px;line-height:1.7">' + escapeHtml(paragraph).replace(/\n/g, '<br>') + '</p>').join('')
  const detailRows = details.map((detail) =>
    '<tr><td style="padding:11px 12px;border-bottom:1px solid #2a2a30;color:#9a9aa4;font-size:13px">' + escapeHtml(detail.label) + '</td><td align="right" style="padding:11px 12px;border-bottom:1px solid #2a2a30;color:#f5f5f7;font-size:13px;font-weight:700;overflow-wrap:anywhere">' + escapeHtml(detail.value) + '</td></tr>',
  ).join('')
  const detailTable = details.length
    ? '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:22px 0;border:1px solid #2a2a30;border-radius:10px;border-collapse:separate;background:#131317">' + detailRows + '</table>'
    : ''
  const button = actionLabel && actionUrl
    ? '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0 8px"><tr><td bgcolor="#ffc21a" style="border-radius:10px"><a href="' + escapeHtml(actionUrl) + '" style="display:inline-block;padding:13px 19px;color:#141000;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px">' + escapeHtml(actionLabel) + '</a></td></tr></table>'
    : ''
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>' + subjectSafe + '</title></head><body style="margin:0;padding:0;background:#08080a;color:#f5f5f7;font-family:Inter,&quot;Segoe UI&quot;,Arial,Helvetica,sans-serif"><div style="display:none;font-size:1px;color:#08080a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">' + escapeHtml(preheader) + '</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#08080a"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:620px"><tr><td style="padding:8px 4px 22px"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="38" height="38" align="center" valign="middle" bgcolor="#ffc21a" style="width:38px;height:38px;border-radius:10px;color:#141000;font-size:19px;font-weight:900">S</td><td style="padding-left:11px"><div aria-label="SL SPOT" style="font-size:17px;line-height:1.2;font-weight:800;letter-spacing:1.4px;color:#f5f5f7">SL<span style="color:#ffc21a">SPOT</span></div><div style="margin-top:4px;color:#9a9aa4;font-size:10px;letter-spacing:2px">ACCOUNT &amp; TRADING UPDATES</div></td></tr></table></td></tr><tr><td style="padding:30px 28px;background:#0f0f12;border:1px solid #2a2a30;border-top:3px solid #ffc21a;border-radius:14px"><div style="margin-bottom:12px;color:#ffc21a;font-size:11px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase">' + escapeHtml(spec.category) + '</div><h1 style="margin:0 0 20px;color:#f5f5f7;font-size:26px;line-height:1.25;font-weight:750">' + titleSafe + '</h1>' + htmlBody + detailTable + button + '<p style="margin:22px 0 0;color:#9a9aa4;font-size:12px;line-height:1.6">For your security, SL Spot will never ask you to send your password or one-time verification code by email.</p></td></tr><tr><td style="padding:22px 6px 4px;color:#62626c;font-size:12px;line-height:1.7"><strong style="color:#9a9aa4">SL Spot</strong><br>Automated account notification. Replies to this address may not be monitored.<br>If you need help, open the support area from your account.<br><span style="color:#62626c">© SL Spot · This message was intended for the account recipient.</span></td></tr></table></td></tr></table></body></html>'
  const textDetails = details.length ? '\n\n' + details.map((detail) => detail.label + ': ' + detail.value).join('\n') : ''
  const textAction = actionLabel && actionUrl ? '\n\n' + actionLabel + ': ' + actionUrl : ''
  return {
    subject,
    html,
    text: heading + '\n\n' + body + textDetails + textAction + '\n\nSL Spot will never ask for your password or one-time verification code by email.',
    templateKey: key,
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
