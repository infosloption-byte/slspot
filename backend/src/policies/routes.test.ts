import assert from 'node:assert/strict'
import test from 'node:test'
import { buildApp } from '../app.js'

test('public policy registry exposes server-owned versions and draft status', async () => {
  const app = buildApp({ logging: false })
  await app.ready()
  const response = await app.inject({ method: 'GET', url: '/api/v1/policies/current' })

  assert.equal(response.statusCode, 200)
  const data = response.json<{ data: {
    status: string
    draftNotice: string
    registrationRequired: string[]
    policies: Array<{ type: string; slug: string; version: string; status: string; requiredAtRegistration: boolean }>
  } }>().data

  assert.equal(data.status, 'DRAFT')
  assert.match(data.draftNotice, /draft/i)
  assert.deepEqual(data.registrationRequired, ['TERMS_AND_CONDITIONS', 'PRIVACY_POLICY'])
  assert.equal(data.policies.length, 8)
  assert.equal(data.policies.every((policy) => policy.version.length > 0 && policy.status === 'DRAFT'), true)
  assert.equal(data.policies.find((policy) => policy.type === 'TERMS_AND_CONDITIONS')?.requiredAtRegistration, true)
  assert.equal(data.policies.find((policy) => policy.type === 'PRIVACY_POLICY')?.requiredAtRegistration, true)

  await app.close()
})
