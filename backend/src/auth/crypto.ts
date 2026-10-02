import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto'

const SCRYPT_COST = 16_384
const SCRYPT_BLOCK_SIZE = 8
const SCRYPT_PARALLELIZATION = 1
const KEY_LENGTH = 64
const SALT_LENGTH = 16
const MAXMEM = 32 * 1024 * 1024

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      resolve(derivedKey)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH)
  const derived = await scryptAsync(password, salt, KEY_LENGTH, {
    cost: SCRYPT_COST,
    blockSize: SCRYPT_BLOCK_SIZE,
    parallelization: SCRYPT_PARALLELIZATION,
    maxmem: MAXMEM,
  })

  return [
    'scrypt',
    `N=${SCRYPT_COST},r=${SCRYPT_BLOCK_SIZE},p=${SCRYPT_PARALLELIZATION}`,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$')
}

export function parsePasswordHash(value: string) {
  const parts = value.split('$')

  if (parts.length !== 4) {
    return null
  }

  const [algorithm, parameterText, saltText, hashText] = parts

  if (
    algorithm !== 'scrypt' ||
    parameterText === undefined ||
    saltText === undefined ||
    hashText === undefined
  ) {
    return null
  }

  const match = /^N=(\d+),r=(\d+),p=(\d+)$/.exec(parameterText)

  if (!match) {
    return null
  }

  const [, nText, rText, pText] = match

  if (nText === undefined || rText === undefined || pText === undefined) {
    return null
  }

  const n = Number(nText)
  const r = Number(rText)
  const p = Number(pText)

  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null
  }

  try {
    const salt = Buffer.from(saltText, 'base64url')
    const hash = Buffer.from(hashText, 'base64url')

    if (salt.length < SALT_LENGTH || hash.length !== KEY_LENGTH) {
      return null
    }

    return { n, r, p, salt, hash }
  } catch {
    return null
  }
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash)

  if (!parsed) {
    return false
  }

  const derived = await scryptAsync(password, parsed.salt, parsed.hash.length, {
    cost: parsed.n,
    blockSize: parsed.r,
    parallelization: parsed.p,
    maxmem: MAXMEM,
  })

  return timingSafeEqual(derived, parsed.hash)
}

export function createOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}
