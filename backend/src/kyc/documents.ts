import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Encrypted on-disk store for identity documents uploaded for manual review.
 *
 * Each file is sealed with AES-256-GCM using a random IV, and the storage key is bound in as additional
 * authenticated data so a ciphertext cannot be swapped between records. The database keeps only metadata and
 * the random storage key. Plain bytes are never written to disk.
 *
 * File layout: [1 byte version][12 byte IV][16 byte auth tag][ciphertext].
 */

export const KYC_UPLOAD_KINDS = ['ID_FRONT', 'ID_BACK', 'SELFIE'] as const
export type KycUploadKind = (typeof KYC_UPLOAD_KINDS)[number]

export const KYC_UPLOAD_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type KycUploadMime = (typeof KYC_UPLOAD_MIME_TYPES)[number]

const VERSION = 1
const IV_BYTES = 12
const TAG_BYTES = 16
const STORAGE_KEY_PATTERN = /^[a-f0-9]{32}$/

export class DocumentStoreError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'DocumentStoreError'
    this.code = code
  }
}

/** Accepts a 64-character hex string or a base64 string that decodes to exactly 32 bytes. */
export function parseEncryptionKey(raw: string): Buffer {
  const value = raw.trim()
  if (/^[a-fA-F0-9]{64}$/.test(value)) return Buffer.from(value, 'hex')
  const decoded = Buffer.from(value, 'base64')
  if (decoded.length === 32 && decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')) return decoded
  throw new DocumentStoreError('INVALID_KEY', 'KYC_DOCUMENT_ENCRYPTION_KEY must be 32 bytes, given as 64 hex characters or base64')
}

/** Identify an image by its leading bytes. The client-supplied MIME type is never trusted. */
export function sniffImageMime(data: Buffer): KycUploadMime | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

export interface KycDocumentStore {
  /** Seal and store the bytes, returning the random storage key. */
  put(data: Buffer): Promise<string>
  /** Decrypt and return the bytes. Throws DocumentStoreError if missing or tampered with. */
  get(storageKey: string): Promise<Buffer>
  /** Remove the file. Removing a file that is already gone is not an error. */
  remove(storageKey: string): Promise<void>
}

export class EncryptedFileStore implements KycDocumentStore {
  private readonly key: Buffer
  private readonly directory: string

  constructor(directory: string, key: Buffer) {
    if (key.length !== 32) throw new DocumentStoreError('INVALID_KEY', 'The document encryption key must be 32 bytes')
    this.key = key
    this.directory = path.resolve(directory)
  }

  private filePath(storageKey: string): string {
    // The key is always generated here, but anything read back from storage is still validated before it touches a path.
    if (!STORAGE_KEY_PATTERN.test(storageKey)) throw new DocumentStoreError('INVALID_STORAGE_KEY', 'Invalid document reference')
    return path.join(this.directory, storageKey + '.bin')
  }

  async put(data: Buffer): Promise<string> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const storageKey = randomBytes(16).toString('hex')
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(storageKey, 'ascii'))
    const sealed = Buffer.concat([cipher.update(data), cipher.final()])
    const file = Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), sealed])
    const target = this.filePath(storageKey)
    // Write then rename so a crash never leaves a half-written file under its final name.
    const temporary = target + '.tmp'
    await writeFile(temporary, file, { mode: 0o600, flag: 'wx' })
    await rename(temporary, target)
    return storageKey
  }

  async get(storageKey: string): Promise<Buffer> {
    let file: Buffer
    try {
      file = await readFile(this.filePath(storageKey))
    } catch (error) {
      if (error instanceof DocumentStoreError) throw error
      throw new DocumentStoreError('NOT_FOUND', 'The stored document is no longer available')
    }
    if (file.length < 1 + IV_BYTES + TAG_BYTES || file[0] !== VERSION) throw new DocumentStoreError('CORRUPT', 'The stored document could not be read')
    const iv = file.subarray(1, 1 + IV_BYTES)
    const tag = file.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES)
    const sealed = file.subarray(1 + IV_BYTES + TAG_BYTES)
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv)
      decipher.setAAD(Buffer.from(storageKey, 'ascii'))
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(sealed), decipher.final()])
    } catch {
      throw new DocumentStoreError('CORRUPT', 'The stored document could not be decrypted')
    }
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.filePath(storageKey), { force: true })
  }
}
