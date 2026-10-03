import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const AES_ALGORITHM = 'aes-256-gcm'
const TOTP_DIGITS = 6
const TOTP_STEP_SECONDS = 30

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]!
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31]!
  return output
}

function base32Decode(value: string): Buffer {
  const normalized = value.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase()
  let bits = 0
  let current = 0
  const bytes: number[] = []
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index < 0) throw new Error('Invalid Base32 secret')
    current = (current << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  if (bytes.length === 0) throw new Error('Invalid Base32 secret')
  return Buffer.from(bytes)
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

export function createTotpCode(secret: string, timestampMs = Date.now()): string {
  const counter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS)
  const secretBytes = base32Decode(secret)
  const counterBytes = Buffer.alloc(8)
  counterBytes.writeBigUInt64BE(BigInt(counter), 0)

  const digest = createHmac('sha1', secretBytes).update(counterBytes).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)
  return String(binary % 1_000_000).padStart(TOTP_DIGITS, '0')
}

export function verifyTotpCode(secret: string, code: string, timestampMs = Date.now(), window = 1): boolean {
  const normalized = code.replace(/\D/g, '')
  if (!/^\d{6}$/.test(normalized)) return false

  const nowCounter = Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS)
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = createTotpCode(secret, (nowCounter + offset) * TOTP_STEP_SECONDS * 1000)
    const left = Buffer.from(candidate)
    const right = Buffer.from(normalized)
    if (left.length === right.length && timingSafeEqual(left, right)) return true
  }
  return false
}

export function createOtpAuthUri(secret: string, issuer: string, accountName: string): string {
  return 'otpauth://totp/' + encodeURIComponent(issuer + ':' + accountName)
    + '?secret=' + encodeURIComponent(secret)
    + '&issuer=' + encodeURIComponent(issuer)
    + '&algorithm=SHA1&digits=6&period=30'
}

export function encryptTotpSecret(secret: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex')
  const iv = randomBytes(12)
  const cipher = createCipheriv(AES_ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.')
}

export function decryptTotpSecret(payload: string, keyHex: string): string {
  const [ivText, tagText, ciphertextText] = payload.split('.')
  if (!ivText || !tagText || !ciphertextText) throw new Error('Invalid encrypted two-factor secret')

  const decipher = createDecipheriv(AES_ALGORITHM, Buffer.from(keyHex, 'hex'), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function createRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(8).toString('hex').toUpperCase()
    return raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12) + '-' + raw.slice(12)
  })
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
}
