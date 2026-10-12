import test from 'node:test'
import assert from 'node:assert/strict'
import { encodeQr, qrToSvgPath, QR_MAX_BYTES } from './qr'

// Reference matrix for "hello world" (version 1, level M) produced by an independent encoder (OpenCV).
const HELLO_WORLD = `
#######..#.##.#######
#.....#...#...#.....#
#.###.#.####..#.###.#
#.###.#.###.#.#.###.#
#.###.#.#.#.#.#.###.#
#.....#.#..#..#.....#
#######.#.#.#.#######
........#.#..........
#.#####..#.#..#####..
.##.##.#.#.########.#
#.#.####.##.###..###.
#.#..#...#.###..###..
...#.#####..###.....#
........#.#.#...##..#
#######....#..#...##.
#.....#.#....#.#.####
#.###.#.#..#..##....#
#.###.#.##..######...
#.###.#.##..#..#..#..
#.....#..##.##..###..
#######.##.##.#.#..#.
`.trim().split('\n')

function toRows(matrix: boolean[][]): string[] {
  return matrix.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''))
}

test('matches an independent encoder for a known input', () => {
  assert.deepEqual(toRows(encodeQr('hello world')), HELLO_WORLD)
})

test('picks the smallest version that fits and grows with the text', () => {
  assert.equal(encodeQr('a').length, 21) // version 1
  assert.equal(encodeQr('x'.repeat(14)).length, 21) // last byte count that fits version 1 at level M
  assert.equal(encodeQr('x'.repeat(15)).length, 25) // version 2
  assert.equal(encodeQr('x'.repeat(QR_MAX_BYTES)).length, 73) // version 14
})

test('draws the three finder patterns and the timing pattern', () => {
  const matrix = encodeQr('otpauth://totp/SL%20Spot:test%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=SL%20Spot')
  const size = matrix.length
  for (const [top, left] of [[0, 0], [0, size - 7], [size - 7, 0]] as const) {
    for (let i = 0; i < 7; i += 1) {
      assert.equal(matrix[top]![left + i], true)
      assert.equal(matrix[top + 6]![left + i], true)
      assert.equal(matrix[top + i]![left], true)
      assert.equal(matrix[top + i]![left + 6], true)
    }
    assert.equal(matrix[top + 3]![left + 3], true)
    assert.equal(matrix[top + 1]![left + 1], false)
  }
  for (let i = 8; i < size - 8; i += 1) {
    assert.equal(matrix[6]![i], i % 2 === 0)
    assert.equal(matrix[i]![6], i % 2 === 0)
  }
  assert.equal(matrix[size - 8]![8], true) // the always-dark module
})

test('is deterministic and handles non-ASCII text', () => {
  assert.deepEqual(encodeQr('café'), encodeQr('café'))
  assert.notDeepEqual(encodeQr('café'), encodeQr('cafe'))
})

test('rejects text that cannot fit', () => {
  assert.throws(() => encodeQr('x'.repeat(QR_MAX_BYTES + 1)))
})

test('svg path covers every dark module once and includes the quiet zone', () => {
  const matrix = encodeQr('hello world')
  const { path, size } = qrToSvgPath(matrix)
  assert.equal(size, matrix.length + 8)
  const runs = [...path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)]
  let covered = 0
  for (const run of runs) covered += Number(run[3])
  assert.equal(covered, matrix.flat().filter(Boolean).length)
})
