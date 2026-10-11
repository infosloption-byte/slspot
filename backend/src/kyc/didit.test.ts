import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'
import { DiditProvider } from './didit.js'
import { InvalidKycSignatureError } from './types.js'

const SECRET = 'whsec_test'
const NOW = new Date('2026-10-11T10:00:00Z')
const ts = String(Math.floor(NOW.getTime() / 1000))

function provider(fetchImpl?: typeof fetch) {
  return new DiditProvider({ apiKey: 'key', workflowId: 'wf-1', webhookSecret: SECRET, callbackUrl: 'https://app.example/account', fetchImpl, now: () => NOW })
}
const hmac = (text: string) => createHmac('sha256', SECRET).update(text, 'utf8').digest('hex')
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v
  return JSON.stringify(sort(value))
}

describe('DiditProvider webhooks', () => {
  const payload = { webhook_type: 'status.updated', session_id: 'sess-1', status: 'Approved', event_id: 'evt-1', decision: { name: 'Zoë Ünal', score: 1.0 } }
  const rawBody = JSON.stringify(payload)

  it('accepts the canonical-JSON signature (V2) even when the body is re-ordered', () => {
    const reordered = JSON.stringify({ status: 'Approved', decision: payload.decision, event_id: 'evt-1', session_id: 'sess-1', webhook_type: 'status.updated' })
    const event = provider().verifyWebhook(reordered, { 'x-signature-v2': hmac(canonical(payload)), 'x-timestamp': ts })
    assert.deepEqual(event, { eventId: 'evt-1', providerCaseId: 'sess-1', outcome: 'approved', reason: undefined })
  })

  it('accepts the raw-body signature', () => {
    assert.equal(provider().verifyWebhook(rawBody, { 'x-signature': hmac(rawBody), 'x-timestamp': ts }).outcome, 'approved')
  })

  it('rejects a bad, missing or tampered signature', () => {
    const p = provider()
    assert.throws(() => p.verifyWebhook(rawBody, { 'x-signature': hmac('other'), 'x-timestamp': ts }), InvalidKycSignatureError)
    assert.throws(() => p.verifyWebhook(rawBody, { 'x-timestamp': ts }), InvalidKycSignatureError)
    const tampered = rawBody.replace('Approved', 'Declined')
    assert.throws(() => p.verifyWebhook(tampered.replace('Declined', 'Approved') + ' ', { 'x-signature': hmac(rawBody), 'x-timestamp': ts }), InvalidKycSignatureError)
    const forged = JSON.stringify({ ...payload, session_id: 'someone-else' })
    assert.throws(() => p.verifyWebhook(forged, { 'x-signature-v2': hmac(canonical(payload)), 'x-timestamp': ts }), InvalidKycSignatureError)
  })

  it('ignores the deprecated envelope-only signature', () => {
    const simple = hmac([ts, 'sess-1', 'Approved', 'status.updated'].join(':'))
    assert.throws(() => provider().verifyWebhook(rawBody, { 'x-signature-simple': simple, 'x-timestamp': ts }), InvalidKycSignatureError)
  })

  it('rejects stale and missing timestamps, which blocks replays of old deliveries', () => {
    const p = provider()
    const old = String(Math.floor(NOW.getTime() / 1000) - 301)
    assert.throws(() => p.verifyWebhook(rawBody, { 'x-signature': hmac(rawBody), 'x-timestamp': old }), InvalidKycSignatureError)
    assert.throws(() => p.verifyWebhook(rawBody, { 'x-signature': hmac(rawBody) }), InvalidKycSignatureError)
  })

  it('maps statuses and never approves on an unknown one', () => {
    assert.deepEqual(DiditProvider.mapStatus('Approved'), { outcome: 'approved' })
    assert.equal(DiditProvider.mapStatus('Declined').outcome, 'rejected')
    assert.equal(DiditProvider.mapStatus('In Review').outcome, 'review')
    assert.equal(DiditProvider.mapStatus('Expired').outcome, 'rejected')
    assert.equal(DiditProvider.mapStatus('Abandoned').outcome, 'rejected')
    for (const status of ['In Progress', 'Not Started', 'Awaiting User', 'Resubmitted', 'Kyc Expired', 'approved', '']) {
      assert.equal(DiditProvider.mapStatus(status).outcome, 'pending', status)
    }
  })

  it('does not let a non-status event decide a case', () => {
    const body = JSON.stringify({ ...payload, webhook_type: 'data.updated' })
    assert.equal(provider().verifyWebhook(body, { 'x-signature': hmac(body), 'x-timestamp': ts }).outcome, 'pending')
  })

  it('builds an event id when Didit sends none', () => {
    const body = JSON.stringify({ webhook_type: 'status.updated', session_id: 's', status: 'Declined' })
    assert.equal(provider().verifyWebhook(body, { 'x-signature': hmac(body), 'x-timestamp': ts }).eventId, 's:Declined:' + ts)
  })
})

describe('DiditProvider.createSession', () => {
  const input = { caseId: 'case-1', documentType: 'passport' as const, subject: { userId: 'u1', email: 'a@example.com', legalName: 'Ada Lovelace', dateOfBirth: '1990-05-05', countryCode: 'LK' } }

  it('creates a session with only the case id and email, and returns the hosted link', async () => {
    let seen: { url: string; init: RequestInit } | undefined
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init }
      return new Response(JSON.stringify({ session_id: 'sess-9', url: 'https://verify.didit.me/session/abc' }), { status: 201 })
    }) as unknown as typeof fetch
    const result = await provider(fetchImpl).createSession(input)
    assert.deepEqual(result, { providerCaseId: 'sess-9', flow: { kind: 'redirect', url: 'https://verify.didit.me/session/abc' } })
    assert.equal(seen?.url, 'https://verification.didit.me/v3/session/')
    assert.equal((seen?.init.headers as Record<string, string>)['x-api-key'], 'key')
    const body = JSON.parse(String(seen?.init.body)) as Record<string, unknown>
    assert.equal(body.workflow_id, 'wf-1')
    assert.equal(body.vendor_data, 'case-1')
    assert.equal(body.callback, 'https://app.example/account')
    assert.equal(JSON.stringify(body).includes('Lovelace'), false)
    assert.equal(JSON.stringify(body).includes('1990'), false)
  })

  it('fails on an error status, a bad response or a non-https link', async () => {
    const respond = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    await assert.rejects(provider(respond(401, {})).createSession(input), /status 401/)
    await assert.rejects(provider(respond(201, { nope: 1 })).createSession(input), /unexpected/)
    await assert.rejects(provider(respond(201, { session_id: 's', url: 'http://insecure.example' })).createSession(input), /non-https/)
    await assert.rejects(provider(respond(201, { session_id: 's', url: 'javascript:alert(1)' })).createSession(input), /non-https/)
  })

  it('refuses to be built without credentials', () => {
    assert.throws(() => new DiditProvider({ apiKey: '', workflowId: 'w', webhookSecret: 's' }))
  })
})
