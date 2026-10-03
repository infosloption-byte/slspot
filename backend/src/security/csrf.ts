import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'

const TOKEN_PARTS = 3
const TOKEN_VERSION = 'v1'

function hashBinding(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sign(payload: string): string {
  return createHmac('sha256', env.security.csrfSecret).update(payload).digest('base64url')
}

export function createCsrfToken(sessionToken?: string): string {
  const binding = hashBinding(sessionToken ?? 'anonymous')
  const nonce = randomBytes(32).toString('base64url')
  const payload = TOKEN_VERSION + '.' + binding + '.' + nonce
  return payload + '.' + sign(payload)
}

export function verifyCsrfToken(token: string | undefined, sessionToken?: string): boolean {
  if (!token) return false
  const parts = token.split('.')
  if (parts.length !== TOKEN_PARTS + 1 || parts[0] !== TOKEN_VERSION) return false

  const payload = parts.slice(0, TOKEN_PARTS).join('.')
  const signature = parts[TOKEN_PARTS]
  if (!signature) return false
  const expectedBinding = hashBinding(sessionToken ?? 'anonymous')
  if (parts[1] !== expectedBinding) return false

  const expected = sign(payload)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}
