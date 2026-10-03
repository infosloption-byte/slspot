import { env } from '../config/env.js'
import { incrementWithExpiry, isRedisReady } from '../realtime/redis.js'

export class RateLimitError extends Error {
  readonly statusCode = 429
  readonly code = 'RATE_LIMITED'
  readonly retryAfterSeconds: number

  constructor(retryAfterSeconds: number) {
    super('Too many requests. Please try again later.')
    this.name = 'RateLimitError'
    this.retryAfterSeconds = retryAfterSeconds
  }
}

type Bucket = { count: number; resetAt: number }
const memoryBuckets = new Map<string, Bucket>()
let cleanupScheduled = false

function consumeMemory(key: string, windowSeconds: number): { count: number; resetAt: number } {
  const now = Date.now()
  const existing = memoryBuckets.get(key)
  const resetAt = now + windowSeconds * 1000
  const bucket = existing && existing.resetAt > now ? existing : { count: 0, resetAt }
  bucket.count += 1
  memoryBuckets.set(key, bucket)

  if (!cleanupScheduled) {
    cleanupScheduled = true
    const timer = setTimeout(() => {
      cleanupScheduled = false
      const current = Date.now()
      for (const [bucketKey, value] of memoryBuckets) {
        if (value.resetAt <= current) memoryBuckets.delete(bucketKey)
      }
    }, windowSeconds * 1000).unref()
    void timer
  }

  return bucket
}

export async function enforceRateLimit(input: {
  key: string
  limit: number
  windowSeconds: number
}): Promise<void> {
  let count = 0
  let retryAfterSeconds = input.windowSeconds

  if (isRedisReady()) {
    try {
      count = await incrementWithExpiry('security:ratelimit:' + input.key, input.windowSeconds)
    } catch {
      if (env.nodeEnv === 'production') {
        const error = new Error('Rate limiting service is unavailable')
        Object.assign(error, { statusCode: 503, code: 'RATE_LIMITER_UNAVAILABLE' })
        throw error
      }
      const bucket = consumeMemory(input.key, input.windowSeconds)
      count = bucket.count
      retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000))
    }
  } else {
    if (env.nodeEnv === 'production') {
      const error = new Error('Rate limiting service is unavailable')
      Object.assign(error, { statusCode: 503, code: 'RATE_LIMITER_UNAVAILABLE' })
      throw error
    }
    const bucket = consumeMemory(input.key, input.limit, input.windowSeconds)
    count = bucket.count
    retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000))
  }

  if (count > input.limit) throw new RateLimitError(retryAfterSeconds)
}
