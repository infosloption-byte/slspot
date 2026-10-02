import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback)
const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const MAXMEM = 32 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = (await scrypt(password, salt, KEY_LENGTH, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM,
  })) as Buffer

  return [
    'scrypt',
    `N=${SCRYPT_N},r=${SCRYPT_R},p=${SCRYPT_P}`,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

export function parsePasswordHash(value: string) {
  const parts = value.split('$')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return null

  const params = Object.fromEntries(
    parts[1].split(',').map((item) => {
      const [key, raw] = item.split('=')
      return [key, Number(raw)]
    }),
  )

  if (!Number.isInteger(params.N) || !Number.isInteger(params.r) || !Number.isInteger(params.p)) {
    return null
  }

  try {
    const salt = Buffer.from(parts[2], 'base64url')
    const hash = Buffer.from(parts[3], 'base64url')
    if (salt.length < SALT_LENGTH || hash.length !== KEY_LENGTH) return null
    return { n: params.N, r: params.r, p: params.p, salt, hash }
  } catch {
    return null
  }
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash)
  if (!parsed) return false

  const derived = (await scrypt(password, parsed.salt, parsed.hash.length, {
    N: parsed.n, r: parsed.r, p: parsed.p, maxmem: MAXMEM,
  })) as Buffer

  return timingSafeEqual(derived, parsed.hash)
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
