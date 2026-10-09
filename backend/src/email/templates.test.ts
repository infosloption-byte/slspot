import assert from 'node:assert/strict'
import test from 'node:test'
import {
  EMAIL_TEMPLATE_KEYS,
  classifyNotificationTemplate,
  getEmailTemplateSamples,
  renderEmailTemplate,
} from './templates.js'

test('every transactional email template renders a complete branded HTML and text email', () => {
  const samples = getEmailTemplateSamples()
  assert.equal(samples.length, EMAIL_TEMPLATE_KEYS.length)

  for (const sample of samples) {
    assert.ok(sample.html.startsWith('<!doctype html>'), sample.key)
    assert.match(sample.html, /SL SPOT/, sample.key)
    assert.match(sample.html, /viewport/, sample.key)
    assert.ok(sample.text.length > 20, sample.key)
    assert.equal(sample.recipient, 'trader@example.com')
  }
})

test('transactional emails use the SL Spot Black Gold platform theme', () => {
  const rendered = renderEmailTemplate('deposit-success')

  assert.match(rendered.html, /background:#08080a/)
  assert.match(rendered.html, /background:#0f0f12/)
  assert.match(rendered.html, /#ffc21a/)
  assert.match(rendered.html, /color:#141000/)
  assert.match(rendered.html, /font-family:Inter/)
  assert.match(rendered.html, /aria-label="SL SPOT"/)
  assert.doesNotMatch(rendered.html, /#67e8a5|#111a29|#263244|#080d16/i)
})

test('dynamic email content is HTML-escaped and does not reuse sample transaction details', () => {
  const rendered = renderEmailTemplate('deposit-success', {
    heading: '<script>alert(1)</script>',
    body: 'Credited <img src=x onerror=alert(1)>',
    details: [],
  })

  assert.ok(rendered.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'))
  assert.ok(rendered.html.includes('Credited &lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(!rendered.html.includes('<script>alert(1)</script>'))
  assert.ok(!rendered.html.includes('DEMO-DEP-82A4'))
})

test('notification categories select event-specific email templates', () => {
  assert.equal(classifyNotificationTemplate('deposit', 'Demo deposit completed', 'Wallet was credited'), 'deposit-success')
  assert.equal(classifyNotificationTemplate('deposit', 'Deposit failed', 'Could not complete'), 'deposit-failed')
  assert.equal(classifyNotificationTemplate('withdrawal', 'Withdrawal request received', 'Request is processing'), 'withdrawal-request')
  assert.equal(classifyNotificationTemplate('withdrawal', 'Demo withdrawal completed', 'Withdrawal was completed'), 'withdrawal-success')
  assert.equal(classifyNotificationTemplate('withdrawal', 'Withdrawal rejected', 'Request was rejected'), 'withdrawal-failed')
  assert.equal(classifyNotificationTemplate('trade_result', 'Trade settled', 'Trade won'), 'trade-result')
  assert.equal(classifyNotificationTemplate('security', 'New sign-in', 'New sign-in session'), 'login-alert')
  assert.equal(classifyNotificationTemplate('security', 'Password changed', 'Password changed'), 'password-changed')
  assert.equal(classifyNotificationTemplate('support', 'Support update', 'Agent replied'), 'support-update')
  assert.equal(classifyNotificationTemplate('system', 'System announcement', 'New release'), 'system-announcement')
})

test('event-specific notification overrides retain the expected destination and subject', () => {
  const rendered = renderEmailTemplate('withdrawal-success', {
    subject: 'SL Spot — Demo withdrawal completed',
    heading: 'Demo withdrawal completed',
    body: 'Demo wallet withdrawal of 12.50 USD was completed.',
    details: [],
  })

  assert.equal(rendered.subject, 'SL Spot — Demo withdrawal completed')
  assert.ok(rendered.html.includes('Demo wallet withdrawal of 12.50 USD was completed.'))
  assert.match(rendered.html, /href="[^"]*\/app\/wallet"/)
  assert.equal(rendered.templateKey, 'withdrawal-success')
})

test('a withdrawal that was not sent and refunded uses the failure template', () => {
  assert.equal(
    classifyNotificationTemplate('withdrawal', 'Withdrawal not sent', 'Your withdrawal was not sent (declined). The full amount was returned to your wallet.'),
    'withdrawal-failed',
  )
  assert.equal(classifyNotificationTemplate('withdrawal', 'Withdrawal completed', 'Your withdrawal was sent.'), 'withdrawal-success')
})
