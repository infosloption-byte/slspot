import assert from 'node:assert/strict'
import test from 'node:test'
import { env } from '../config/env.js'
import { EmailService, getEmailPreviewMessage, listEmailPreviewMessages } from './service.js'

test('development with email delivery disabled captures rendered messages in the local preview outbox', {
  skip: env.nodeEnv !== 'development' || env.email.provider !== 'disabled',
}, async () => {
  const service = new EmailService()
  const before = listEmailPreviewMessages().length
  const result = await service.sendNotification(
    'qa@example.com',
    'local-withdrawal-request-test',
    'Withdrawal request received',
    'We received your withdrawal request for 10.00 USD.',
    'withdrawal',
  )

  assert.equal(result.sent, false)
  assert.ok(result.providerId?.startsWith('preview:'))
  const after = listEmailPreviewMessages()
  assert.equal(after.length, Math.min(before + 1, 250))

  const id = result.providerId?.slice('preview:'.length) ?? ''
  const message = getEmailPreviewMessage(id)
  assert.ok(message)
  assert.equal(message.to, 'qa@example.com')
  assert.equal(message.templateKey, 'withdrawal-request')
  assert.match(message.subject, /Withdrawal request received/)
  assert.match(message.html, /We received your withdrawal request for 10\.00 USD\./)
})
