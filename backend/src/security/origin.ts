import type { FastifyRequest } from 'fastify'
import { env } from '../config/env.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class OriginSecurityError extends Error {
  readonly statusCode = 403
  readonly code = 'ORIGIN_NOT_ALLOWED'
  constructor(message = 'Request origin is not allowed') {
    super(message)
    this.name = 'OriginSecurityError'
  }
}

function headerValue(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function originFromReferrer(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value).origin
  } catch {
    return undefined
  }
}

export function assertTrustedOrigin(request: FastifyRequest): void {
  if (SAFE_METHODS.has(request.method)) return
  if (!request.url.startsWith('/api/')) return

  const origin = headerValue(request, 'origin') ?? originFromReferrer(headerValue(request, 'referer'))
  const fetchSite = headerValue(request, 'sec-fetch-site')

  if (fetchSite === 'cross-site') throw new OriginSecurityError('Cross-site requests are not allowed')
  if (origin && !env.corsOrigins.includes(origin)) throw new OriginSecurityError()
  if (fetchSite === 'same-site' && origin && !env.corsOrigins.includes(origin)) {
    throw new OriginSecurityError('Same-site request is not from an allowed application origin')
  }
}


export function assertTrustedWebSocketOrigin(request: FastifyRequest): void {
  const origin = headerValue(request, 'origin')
  const fetchSite = headerValue(request, 'sec-fetch-site')
  const host = headerValue(request, 'host')

  if (!origin || fetchSite === 'cross-site') {
    throw new OriginSecurityError('WebSocket origin is not allowed')
  }

  // A browser connection through the local Vite proxy is same-origin from the
  // browser's perspective, but the backend sees the proxied Host header. Accept
  // that exact host match in development while still requiring configured origins
  // everywhere else.
  if (env.nodeEnv === 'development' && host) {
    try {
      if (new URL(origin).host === host) return
    } catch {
      throw new OriginSecurityError('WebSocket origin is not allowed')
    }
  }

  if (!env.corsOrigins.includes(origin)) {
    throw new OriginSecurityError('WebSocket origin is not allowed')
  }
}
