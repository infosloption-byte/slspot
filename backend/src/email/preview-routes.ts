import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { env } from '../config/env.js'
import { getEmailPreviewMessage, listEmailPreviewMessages } from './service.js'
import { getEmailTemplateSamples, isEmailTemplateKey } from './templates.js'

const PREFIX = '/api/v1/dev/email-previews'

function isLoopbackRequest(request: FastifyRequest): boolean {
  const address = request.ip.toLowerCase().replace(/^::ffff:/, '')
  return address === '127.0.0.1' || address === '::1'
}

function localOnly(request: FastifyRequest, reply: FastifyReply): boolean {
  if (env.nodeEnv !== 'development' || !isLoopbackRequest(request)) {
    reply.code(404).type('text/plain; charset=utf-8').send('Not found')
    return false
  }
  return true
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function page(title: string, content: string): string {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(title) + ' · SL Spot email previews</title><style>' +
    ' :root{color-scheme:dark;font-family:Inter,Segoe UI,Arial,sans-serif;background:#080d16;color:#e5edf8}*{box-sizing:border-box}body{margin:0}header{padding:22px max(20px,calc((100% - 1120px)/2));border-bottom:1px solid #263244;background:#0d1420}header a{color:#67e8a5;text-decoration:none;font-weight:700}main{max-width:1120px;margin:0 auto;padding:28px 20px 56px}h1{margin:0 0 8px;font-size:26px}h2{font-size:17px;margin:0 0 12px}.muted{color:#91a1b8;font-size:13px;line-height:1.6}.section{margin:24px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(245px,1fr));gap:12px}.card{padding:17px;border:1px solid #263244;background:#111a29;border-radius:12px;min-width:0}.eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#67e8a5;font-weight:700}.subject{font-size:14px;line-height:1.5;overflow-wrap:anywhere;margin:9px 0 14px}.button{display:inline-block;padding:9px 12px;border-radius:7px;background:#67e8a5;color:#062012;text-decoration:none;font-weight:700;font-size:12px}.link{color:#67e8a5;text-decoration:none;overflow-wrap:anywhere}.row{padding:13px 0;border-bottom:1px solid #263244;display:flex;justify-content:space-between;gap:16px;align-items:center}.row:last-child{border-bottom:0}.row-main{min-width:0}.row-main strong{display:block;overflow-wrap:anywhere;font-size:14px}.row-main small{display:block;color:#91a1b8;margin-top:5px;overflow-wrap:anywhere;font-size:12px}.pill{border:1px solid #45604f;color:#9ef0bf;border-radius:999px;padding:4px 8px;font-size:10px;white-space:nowrap}.empty{padding:20px;border:1px dashed #36465c;border-radius:10px;color:#91a1b8;font-size:13px}@media(max-width:560px){main{padding:22px 14px 40px}.row{align-items:flex-start;flex-direction:column}header{padding:18px 14px}}' +
    '</style></head><body><header><a href="' + PREFIX + '">SL SPOT&nbsp; / &nbsp;LOCAL EMAIL PREVIEW</a></header><main>' + content + '</main></body></html>'
}

function listPage(): string {
  const samples = getEmailTemplateSamples()
  const templates = '<section class="section"><h2>Template library</h2><p class="muted">These are rendered sample emails with placeholder details. Open each one to inspect the complete HTML layout.</p><div class="grid">' +
    samples.map((sample) => '<article class="card"><div class="eyebrow">' + escapeHtml(sample.category) + '</div><h2 style="margin-top:10px">' + escapeHtml(sample.label) + '</h2><p class="subject">' + escapeHtml(sample.subject) + '</p><p class="muted">Example recipient: ' + escapeHtml(sample.recipient) + '</p><a class="button" href="' + PREFIX + '/templates/' + sample.key + '">Preview email</a></article>').join('') +
    '</div></section>'

  const messages = listEmailPreviewMessages()
  const outbox = '<section class="section"><h2>Captured local outbox <span class="pill">' + messages.length + '</span></h2><p class="muted">When email delivery is disabled in development, outgoing transactional emails are captured here instead of being sent. The outbox is in memory and clears when the backend restarts.</p>' +
    (messages.length
      ? '<div class="card">' + messages.map((message) => '<div class="row"><div class="row-main"><strong>' + escapeHtml(message.subject) + '</strong><small>To: ' + escapeHtml(message.to) + ' · ' + escapeHtml(message.capturedAt) + '</small><small>Template: ' + escapeHtml(message.templateKey ?? 'custom') + '</small></div><a class="link" href="' + PREFIX + '/outbox/' + encodeURIComponent(message.id) + '">Open email →</a></div>').join('') + '</div>'
      : '<div class="empty">No actual emails have been captured in this backend session yet. The template library above is ready to preview; trigger a local event, such as a demo deposit or withdrawal, to populate this outbox.</div>') +
    '</section>'

  return page('Email preview library', '<h1>Transactional email preview</h1><p class="muted">Inspect the messages SL Spot prepares for users before connecting a mail provider. Production deployments do not register these preview routes.</p>' + templates + outbox)
}

function outboxPage(): string {
  const messages = listEmailPreviewMessages()
  const rows = messages.length
    ? '<div class="card">' + messages.map((message) => '<div class="row"><div class="row-main"><strong>' + escapeHtml(message.subject) + '</strong><small>To: ' + escapeHtml(message.to) + ' · ' + escapeHtml(message.capturedAt) + '</small><small>' + escapeHtml(message.templateKey ?? 'custom') + '</small></div><a class="link" href="' + PREFIX + '/outbox/' + encodeURIComponent(message.id) + '">Preview →</a></div>').join('') + '</div>'
    : '<div class="empty">No emails captured yet. Trigger a local account or wallet event and refresh this page.</div>'
  return page('Captured email outbox', '<h1>Captured email outbox</h1><p class="muted">These messages were generated by real application flows and captured locally instead of being delivered.</p>' + rows)
}

export function registerEmailPreviewRoutes(app: FastifyInstance): void {
  app.get(PREFIX, async (request, reply) => {
    if (!localOnly(request, reply)) return
    return reply.type('text/html; charset=utf-8').send(listPage())
  })

  app.get(PREFIX + '/outbox', async (request, reply) => {
    if (!localOnly(request, reply)) return
    return reply.type('text/html; charset=utf-8').send(outboxPage())
  })

  app.get<{ Params: { templateKey: string } }>(PREFIX + '/templates/:templateKey', async (request, reply) => {
    if (!localOnly(request, reply)) return
    if (!isEmailTemplateKey(request.params.templateKey)) {
      return reply.code(404).type('text/plain; charset=utf-8').send('Email template not found')
    }
    const sample = getEmailTemplateSamples().find((item) => item.key === request.params.templateKey)
    if (!sample) return reply.code(404).type('text/plain; charset=utf-8').send('Email template not found')
    return reply.type('text/html; charset=utf-8').send(sample.html)
  })

  app.get<{ Params: { emailId: string } }>(PREFIX + '/outbox/:emailId', async (request, reply) => {
    if (!localOnly(request, reply)) return
    const message = getEmailPreviewMessage(request.params.emailId)
    if (!message) return reply.code(404).type('text/plain; charset=utf-8').send('Captured email not found')
    return reply.type('text/html; charset=utf-8').send(message.html)
  })
}
