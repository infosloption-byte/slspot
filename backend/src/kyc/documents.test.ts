import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { DocumentStoreError, EncryptedFileStore, parseEncryptionKey, sha256Hex, sniffImageMime } from './documents.js'

const KEY = Buffer.alloc(32, 7)
let dir = ''

beforeEach(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'kyc-store-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('EncryptedFileStore', () => {
  it('round-trips bytes and never writes them in the clear', async () => {
    const store = new EncryptedFileStore(dir, KEY)
    const secret = Buffer.from('PASSPORT-NUMBER-X1234567-' + 'a'.repeat(200))
    const key = await store.put(secret)
    assert.match(key, /^[a-f0-9]{32}$/)
    assert.deepEqual(await store.get(key), secret)
    const onDisk = await readFile(path.join(dir, key + '.bin'))
    assert.equal(onDisk.includes(Buffer.from('PASSPORT-NUMBER')), false)
    assert.deepEqual(await readdir(dir), [key + '.bin'])
  })

  it('uses a fresh IV for identical content', async () => {
    const store = new EncryptedFileStore(dir, KEY)
    const a = await store.put(Buffer.from('same'))
    const b = await store.put(Buffer.from('same'))
    assert.notDeepEqual(await readFile(path.join(dir, a + '.bin')), await readFile(path.join(dir, b + '.bin')))
  })

  it('detects tampering and a wrong key', async () => {
    const store = new EncryptedFileStore(dir, KEY)
    const key = await store.put(Buffer.from('hello world'))
    const file = path.join(dir, key + '.bin')
    const bytes = await readFile(file)
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1
    await writeFile(file, bytes)
    await assert.rejects(store.get(key), (error) => error instanceof DocumentStoreError && error.code === 'CORRUPT')
    const other = await store.put(Buffer.from('hello world'))
    await assert.rejects(new EncryptedFileStore(dir, Buffer.alloc(32, 9)).get(other), (error) => error instanceof DocumentStoreError && error.code === 'CORRUPT')
  })

  it('refuses a file moved under another storage key', async () => {
    const store = new EncryptedFileStore(dir, KEY)
    const a = await store.put(Buffer.from('first'))
    const b = await store.put(Buffer.from('second'))
    await writeFile(path.join(dir, b + '.bin'), await readFile(path.join(dir, a + '.bin')))
    await assert.rejects(store.get(b), (error) => error instanceof DocumentStoreError && error.code === 'CORRUPT')
  })

  it('removes files, tolerates a missing one and refuses path traversal', async () => {
    const store = new EncryptedFileStore(dir, KEY)
    const key = await store.put(Buffer.from('x'))
    await store.remove(key)
    await store.remove(key)
    await assert.rejects(store.get(key), (error) => error instanceof DocumentStoreError && error.code === 'NOT_FOUND')
    await assert.rejects(store.get('../../etc/passwd'), (error) => error instanceof DocumentStoreError && error.code === 'INVALID_STORAGE_KEY')
    await assert.rejects(store.remove('../x'), DocumentStoreError)
  })
})

describe('helpers', () => {
  it('accepts hex and base64 keys of 32 bytes only', () => {
    assert.equal(parseEncryptionKey('a'.repeat(64)).length, 32)
    assert.equal(parseEncryptionKey(Buffer.alloc(32, 1).toString('base64')).length, 32)
    assert.throws(() => parseEncryptionKey('too short'), DocumentStoreError)
    assert.throws(() => parseEncryptionKey(Buffer.alloc(16, 1).toString('base64')), DocumentStoreError)
  })

  it('identifies images by content, not by claimed type', () => {
    assert.equal(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), 'image/jpeg')
    assert.equal(sniffImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png')
    assert.equal(sniffImageMime(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')])), 'image/webp')
    assert.equal(sniffImageMime(Buffer.from('<svg onload=alert(1)>')), null)
    assert.equal(sniffImageMime(Buffer.from('%PDF-1.7')), null)
    assert.equal(sniffImageMime(Buffer.alloc(0)), null)
    assert.equal(sha256Hex(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
