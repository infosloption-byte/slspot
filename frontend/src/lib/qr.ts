/**
 * Minimal QR Code encoder (ISO/IEC 18004), byte mode, error-correction level M, versions 1-14.
 *
 * It exists so the two-factor secret is drawn in the browser and never sent to a third-party QR service
 * or pulled in through a dependency. It is intentionally small: no kanji/numeric/alphanumeric modes and no
 * versions above 14 (up to 362 bytes at level M, far more than an authenticator URI needs).
 */

// [error-correction codewords per block, blocks in group 1, data codewords in a group-1 block, blocks in group 2, data codewords in a group-2 block]
const BLOCKS_M: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
  11: [30, 1, 50, 4, 51],
  12: [22, 6, 36, 2, 37],
  13: [22, 8, 37, 1, 38],
  14: [24, 4, 40, 5, 41],
}

const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66],
}

export const QR_MAX_BYTES = 362

// ---------------------------------------------------------------- Reed-Solomon over GF(256), polynomial 0x11D

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255] ?? 0
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[(LOG[a] ?? 0) + (LOG[b] ?? 0)] ?? 0
}

function generatorPolynomial(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j] ?? 0) ^ (poly[j] ?? 0)
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j] ?? 0, EXP[i] ?? 0)
    }
    poly = next
  }
  return poly
}

function reedSolomon(data: number[], degree: number): number[] {
  const generator = generatorPolynomial(degree)
  const remainder = new Array<number>(degree).fill(0)
  for (const byte of data) {
    const factor = byte ^ (remainder.shift() ?? 0)
    remainder.push(0)
    for (let i = 0; i < degree; i += 1) {
      remainder[i] = (remainder[i] ?? 0) ^ gfMul(generator[i + 1] ?? 0, factor)
    }
  }
  return remainder
}

// ---------------------------------------------------------------- bit buffer

function appendBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1)
}

function dataCapacity(version: number): number {
  const [, g1, d1, g2, d2] = BLOCKS_M[version] as [number, number, number, number, number]
  return g1 * d1 + g2 * d2
}

function chooseVersion(byteLength: number): number {
  for (let version = 1; version <= 14; version += 1) {
    const countBits = version < 10 ? 8 : 16
    if (4 + countBits + byteLength * 8 <= dataCapacity(version) * 8) return version
  }
  throw new Error('Text is too long for a QR code')
}

function buildCodewords(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = []
  appendBits(bits, 0b0100, 4)
  appendBits(bits, bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) appendBits(bits, byte, 8)

  const capacityBits = dataCapacity(version) * 8
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let value = 0
    for (let j = 0; j < 8; j += 1) value = (value << 1) | (bits[i + j] ?? 0)
    data.push(value)
  }
  for (let pad = 0xec; data.length < dataCapacity(version); pad ^= 0xec ^ 0x11) data.push(pad)

  const [ecLength, g1, d1, g2, d2] = BLOCKS_M[version] as [number, number, number, number, number]
  const dataBlocks: number[][] = []
  let offset = 0
  for (let i = 0; i < g1 + g2; i += 1) {
    const size = i < g1 ? d1 : d2
    dataBlocks.push(data.slice(offset, offset + size))
    offset += size
  }
  const ecBlocks = dataBlocks.map((block) => reedSolomon(block, ecLength))

  const result: number[] = []
  const longest = Math.max(d1, d2)
  for (let i = 0; i < longest; i += 1) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i] ?? 0)
  }
  for (let i = 0; i < ecLength; i += 1) {
    for (const block of ecBlocks) result.push(block[i] ?? 0)
  }
  return result
}

// ---------------------------------------------------------------- matrix

type Matrix = { size: number; dark: boolean[][]; reserved: boolean[][] }

function createMatrix(version: number): Matrix {
  const size = version * 4 + 17
  return {
    size,
    dark: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    reserved: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  }
}

function setFunction(matrix: Matrix, row: number, col: number, dark: boolean): void {
  if (row < 0 || col < 0 || row >= matrix.size || col >= matrix.size) return
  matrix.dark[row]![col] = dark
  matrix.reserved[row]![col] = true
}

function drawFinder(matrix: Matrix, top: number, left: number): void {
  for (let dr = -1; dr <= 7; dr += 1) {
    for (let dc = -1; dc <= 7; dc += 1) {
      const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
      const dark = inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))
      setFunction(matrix, top + dr, left + dc, dark)
    }
  }
}

function drawAlignment(matrix: Matrix, centerRow: number, centerCol: number): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      setFunction(matrix, centerRow + dr, centerCol + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
    }
  }
}

function drawFunctionPatterns(matrix: Matrix, version: number): void {
  const { size } = matrix
  drawFinder(matrix, 0, 0)
  drawFinder(matrix, 0, size - 7)
  drawFinder(matrix, size - 7, 0)

  for (let i = 8; i < size - 8; i += 1) {
    setFunction(matrix, 6, i, i % 2 === 0)
    setFunction(matrix, i, 6, i % 2 === 0)
  }

  const positions = ALIGNMENT[version] ?? []
  const last = positions.length - 1
  positions.forEach((row, i) => {
    positions.forEach((col, j) => {
      const onFinder = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)
      if (!onFinder) drawAlignment(matrix, row, col)
    })
  })

  // Reserve the format-information areas now; the real bits are written once the mask is known.
  for (let i = 0; i < 9; i += 1) {
    if (i === 6) continue // (8,6) and (6,8) belong to the timing patterns drawn above
    setFunction(matrix, 8, i, false)
    setFunction(matrix, i, 8, false)
  }
  for (let i = 0; i < 8; i += 1) {
    setFunction(matrix, 8, size - 1 - i, false)
    setFunction(matrix, size - 1 - i, 8, false)
  }
  setFunction(matrix, size - 8, 8, true) // the always-dark module

  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        setFunction(matrix, i, size - 11 + j, false)
        setFunction(matrix, size - 11 + j, i, false)
      }
    }
  }
}

function placeData(matrix: Matrix, codewords: number[]): void {
  const { size } = matrix
  const bits: number[] = []
  for (const word of codewords) appendBits(bits, word, 8)

  let index = 0
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (let dc = 0; dc < 2; dc += 1) {
        const col = right - dc
        if (matrix.reserved[row]![col]) continue
        matrix.dark[row]![col] = (bits[index] ?? 0) === 1
        index += 1
      }
    }
    upward = !upward
  }
}

function maskApplies(mask: number, row: number, col: number): boolean {
  switch (mask) {
    case 0: return (row + col) % 2 === 0
    case 1: return row % 2 === 0
    case 2: return col % 3 === 0
    case 3: return (row + col) % 3 === 0
    case 4: return (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0
    default: return (((row + col) % 2) + ((row * col) % 3)) % 2 === 0
  }
}

/** Remainder of `value` (shifted up by the check-bit count) divided by the BCH generator. */
function bchRemainder(value: number, generator: number, totalBits: number, checkBits: number): number {
  let result = value << checkBits
  for (let bit = totalBits - 1; bit >= checkBits; bit -= 1) {
    if ((result >>> bit) & 1) result ^= generator << (bit - checkBits)
  }
  return result
}

function drawFormatBits(matrix: Matrix, mask: number): void {
  const { size } = matrix
  const data = (0b00 << 3) | mask // level M is 00
  const bits = ((data << 10) | bchRemainder(data, 0x537, 15, 10)) ^ 0x5412
  const bit = (i: number) => ((bits >>> i) & 1) === 1

  for (let i = 0; i <= 5; i += 1) matrix.dark[i]![8] = bit(i)
  matrix.dark[7]![8] = bit(6)
  matrix.dark[8]![8] = bit(7)
  matrix.dark[8]![7] = bit(8)
  for (let i = 9; i < 15; i += 1) matrix.dark[8]![14 - i] = bit(i)

  for (let i = 0; i < 8; i += 1) matrix.dark[8]![size - 1 - i] = bit(i)
  for (let i = 8; i < 15; i += 1) matrix.dark[size - 15 + i]![8] = bit(i)
  matrix.dark[size - 8]![8] = true
}

function drawVersionBits(matrix: Matrix, version: number): void {
  if (version < 7) return
  const { size } = matrix
  const bits = (version << 12) | bchRemainder(version, 0x1f25, 18, 12)
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >>> i) & 1) === 1
    const a = size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    matrix.dark[b]![a] = dark
    matrix.dark[a]![b] = dark
  }
}

function penalty(dark: boolean[][]): number {
  const size = dark.length
  let score = 0

  const runScore = (line: boolean[]) => {
    let total = 0
    let run = 1
    for (let i = 1; i <= line.length; i += 1) {
      if (i < line.length && line[i] === line[i - 1]) {
        run += 1
      } else {
        if (run >= 5) total += run - 2
        run = 1
      }
    }
    return total
  }

  const finderLike = (line: boolean[]) => {
    let total = 0
    const a = [true, false, true, true, true, false, true, false, false, false, false]
    const b = [false, false, false, false, true, false, true, true, true, false, true]
    for (let i = 0; i + 11 <= line.length; i += 1) {
      if (a.every((value, k) => line[i + k] === value)) total += 40
      if (b.every((value, k) => line[i + k] === value)) total += 40
    }
    return total
  }

  for (let r = 0; r < size; r += 1) {
    const row = dark[r]!
    const column = dark.map((line) => line[r]!)
    score += runScore(row) + runScore(column) + finderLike(row) + finderLike(column)
  }

  for (let r = 0; r < size - 1; r += 1) {
    for (let c = 0; c < size - 1; c += 1) {
      const value = dark[r]![c]
      if (value === dark[r]![c + 1] && value === dark[r + 1]![c] && value === dark[r + 1]![c + 1]) score += 3
    }
  }

  let darkCount = 0
  for (const row of dark) for (const value of row) if (value) darkCount += 1
  score += Math.floor(Math.abs((darkCount * 20) / (size * size) - 10)) * 10
  return score
}

/** Returns the QR modules as rows of booleans (true = dark), without the quiet zone. */
export function encodeQr(text: string, options: { mask?: number } = {}): boolean[][] {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length > QR_MAX_BYTES) throw new Error('Text is too long for a QR code')
  const version = chooseVersion(bytes.length)
  const codewords = buildCodewords(bytes, version)

  const base = createMatrix(version)
  drawFunctionPatterns(base, version)
  placeData(base, codewords)

  let best: boolean[][] | null = null
  let bestScore = Infinity
  for (let mask = 0; mask < 8; mask += 1) {
    if (options.mask !== undefined && options.mask !== mask) continue
    const candidate: Matrix = { size: base.size, reserved: base.reserved, dark: base.dark.map((row) => [...row]) }
    for (let r = 0; r < candidate.size; r += 1) {
      for (let c = 0; c < candidate.size; c += 1) {
        if (!candidate.reserved[r]![c] && maskApplies(mask, r, c)) candidate.dark[r]![c] = !candidate.dark[r]![c]
      }
    }
    drawFormatBits(candidate, mask)
    drawVersionBits(candidate, version)
    const score = penalty(candidate.dark)
    if (score < bestScore) {
      bestScore = score
      best = candidate.dark
    }
  }
  return best as boolean[][]
}

/** An SVG path (one `M x y h1 v1 h-1z` square per dark module) for the matrix, including a 4-module quiet zone. */
export function qrToSvgPath(matrix: boolean[][], quietZone = 4): { path: string; size: number } {
  let path = ''
  matrix.forEach((row, r) => {
    let c = 0
    while (c < row.length) {
      if (!row[c]) { c += 1; continue }
      let end = c
      while (end < row.length && row[end]) end += 1
      path += 'M' + (c + quietZone) + ' ' + (r + quietZone) + 'h' + (end - c) + 'v1h-' + (end - c) + 'z'
      c = end
    }
  })
  return { path, size: matrix.length + quietZone * 2 }
}
