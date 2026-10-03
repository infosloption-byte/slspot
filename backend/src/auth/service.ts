import type { FastifyRequest } from 'fastify'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { createRealtimeEvent, serializeRealtimeEvent } from '../realtime/events.js'
import { isRedisReady, publish } from '../realtime/redis.js'
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from './crypto.js'
import { createOtpAuthUri, createRecoveryCodes, decryptTotpSecret, encryptTotpSecret, generateTotpSecret, normalizeRecoveryCode, verifyTotpCode } from './totp.js'
import { LedgerService } from '../ledger/service.js'

export type AuthUser = {
  id: string
  email: string
  status: string
  countryCode: string | null
  emailVerifiedAt: Date | null
}

export type AuthSession = AuthUser & {
  sessionId: string
  expiresAt: Date
}

export type AuthLoginResult =
  | { requiresTwoFactor: false; session: AuthSession; sessionToken: string }
  | { requiresTwoFactor: true; user: AuthUser; challengeToken: string; challengeExpiresAt: Date }

export type TwoFactorSetup = {
  enabled: boolean
  secret: string
  otpauthUri: string
}

export type AuthTokenResult = { token: string; expiresAt: Date }

export class AuthError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly retryAfterSeconds: number | undefined
  constructor(statusCode: number, code: string, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function validateEmail(email: string): void {
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError(400, 'INVALID_EMAIL', 'Email address is invalid')
  }
}

function validatePassword(password: string): void {
  const length = Array.from(password).length
  if (length < env.auth.passwordMinLength || length > 128) {
    throw new AuthError(400, 'INVALID_PASSWORD', `Password must be between ${env.auth.passwordMinLength} and 128 characters`)
  }
}

const dummyPasswordHashPromise = hashPassword('slspot-dummy-password')

function validateCountryCode(value: string | undefined): string | null {
  if (value === undefined || value === '') return null
  const countryCode = value.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new AuthError(400, 'INVALID_COUNTRY_CODE', 'Country code must be a 2-letter ISO code')
  }
  return countryCode
}

function describeUserAgent(userAgent?: string): string {
  if (!userAgent) return 'Unknown browser'
  if (/Edg\//i.test(userAgent)) return 'Microsoft Edge'
  if (/Chrome\//i.test(userAgent)) return 'Google Chrome'
  if (/Firefox\//i.test(userAgent)) return 'Mozilla Firefox'
  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent)) return 'Safari'
  if (/Mobile/i.test(userAgent)) return 'Mobile browser'
  return 'Browser session'
}

export class AuthService {
  private readonly ledger: LedgerService

  constructor(private readonly prisma: PrismaClient) {
    this.ledger = new LedgerService(prisma)
  }

  async register(input: { email: string; password: string; countryCode?: string; acceptTerms: boolean; termsVersion?: string }) {
    const email = normalizeEmail(input.email)
    validateEmail(email)
    validatePassword(input.password)
    const countryCode = validateCountryCode(input.countryCode)
    if (!input.acceptTerms) throw new AuthError(400, 'TERMS_CONSENT_REQUIRED', 'You must accept the terms and privacy notice')
    const termsVersion = input.termsVersion?.trim() || '2026-10'
    if (termsVersion.length > 32) throw new AuthError(400, 'INVALID_TERMS_VERSION', 'Terms version is invalid')

    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) {
      const verification = existing.status === 'PENDING_VERIFICATION'
        ? await this.issueToken(existing.id, 'EMAIL_VERIFICATION', env.auth.verificationTtlSeconds)
        : null

      return {
        created: false,
        user: this.toUser(existing),
        verification: env.auth.exposeDevTokens ? verification : null,
      }
    }

    const passwordHash = await hashPassword(input.password)
    const now = new Date()

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email, passwordHash, countryCode, status: 'PENDING_VERIFICATION', termsAcceptedAt: now, termsVersion },
      })

      await this.ensureTradingAccounts(tx, user.id, 'USD')

      const token = createOpaqueToken()
      const expiresAt = new Date(now.getTime() + env.auth.verificationTtlSeconds * 1000)
      await tx.authToken.create({
        data: {
          userId: user.id,
          type: 'EMAIL_VERIFICATION',
          tokenHash: hashOpaqueToken(token),
          expiresAt,
        },
      })

      await tx.auditLog.create({
        data: { actorUserId: user.id, action: 'REGISTER', entityType: 'User', entityId: user.id, metadata: { termsVersion } },
      })

      return { user, verification: { token, expiresAt } }
    })

    return {
      created: true,
      user: this.toUser(result.user),
      verification: env.auth.exposeDevTokens ? result.verification : null,
    }
  }

  async login(input: {
    email: string
    password: string
    rememberDevice?: boolean
    ipAddress?: string
    userAgent?: string
  }): Promise<AuthLoginResult> {
    const email = normalizeEmail(input.email)
    validateEmail(email)
    const user = await this.prisma.user.findUnique({ where: { email } })

    const dummyHash = await dummyPasswordHashPromise
    const valid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, dummyHash)

    if (!user) {
      await this.writeAudit('LOGIN_FAILED', email, undefined, input.ipAddress, input.userAgent)
      throw new AuthError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
    }

    const now = new Date()
    if (user.loginLockedUntil && user.loginLockedUntil > now) {
      const retryAfterSeconds = Math.max(1, Math.ceil((user.loginLockedUntil.getTime() - now.getTime()) / 1000))
      await this.writeAudit('LOGIN_LOCKED', user.id, user.id, input.ipAddress, input.userAgent)
      throw new AuthError(429, 'ACCOUNT_LOCKED', 'Too many unsuccessful sign-in attempts. Try again in ' + retryAfterSeconds + ' seconds.', retryAfterSeconds)
    }

    if (!valid) {
      const lockedUser = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.user.update({
          where: { id: user.id },
          data: { loginFailedCount: { increment: 1 } },
        })
        const lock = claimed.loginFailedCount >= env.auth.loginMaxAttempts
        if (lock) {
          return tx.user.update({
            where: { id: user.id },
            data: {
              loginFailedCount: 0,
              loginLockedUntil: new Date(now.getTime() + env.auth.loginLockSeconds * 1000),
            },
          })
        }
        return claimed
      })

      await this.writeAudit('LOGIN_FAILED', user.id, user.id, input.ipAddress, input.userAgent)
      if (lockedUser.loginLockedUntil) {
        const retryAfterSeconds = Math.max(1, Math.ceil((lockedUser.loginLockedUntil.getTime() - now.getTime()) / 1000))
        await this.writeAudit('LOGIN_LOCKED', user.id, user.id, input.ipAddress, input.userAgent)
        throw new AuthError(429, 'ACCOUNT_LOCKED', 'Too many unsuccessful sign-in attempts. Try again in ' + retryAfterSeconds + ' seconds.', retryAfterSeconds)
      }

      const attemptsRemaining = Math.max(0, env.auth.loginMaxAttempts - lockedUser.loginFailedCount)
      throw new AuthError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect. ' + attemptsRemaining + ' sign-in attempts remaining.')
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new AuthError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification is required')
    }
    if (user.status !== 'ACTIVE') {
      throw new AuthError(403, 'ACCOUNT_UNAVAILABLE', 'This account is not available for login')
    }

    if (user.twoFactorEnabled) {
      if (!user.twoFactorSecretEnc) {
        throw new AuthError(503, 'TWO_FACTOR_UNAVAILABLE', 'Two-factor authentication is configured incorrectly. Contact support.')
      }

      const challengeToken = createOpaqueToken(32)
      const challengeExpiresAt = new Date(now.getTime() + env.auth.twoFactorChallengeTtlSeconds * 1000)
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { loginFailedCount: 0, loginLockedUntil: null },
        })
        await tx.authToken.deleteMany({ where: { userId: user.id, type: 'TWO_FACTOR_CHALLENGE', consumedAt: null } })
        await tx.authToken.create({
          data: {
            userId: user.id,
            type: 'TWO_FACTOR_CHALLENGE',
            tokenHash: hashOpaqueToken(challengeToken),
            expiresAt: challengeExpiresAt,
            attempts: 0,
          },
        })
        await tx.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'TWO_FACTOR_CHALLENGE',
            entityType: 'AuthToken',
            entityId: user.id,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
          },
        })
      })
      return {
        requiresTwoFactor: true,
        user: this.toUser(user),
        challengeToken,
        challengeExpiresAt,
      }
    }

    return this.finishLogin(user.id, user, input.ipAddress, input.userAgent, input.rememberDevice ?? false, now)
  }

  private async finishLogin(userId: string, user: AuthUser, ipAddress: string | undefined, userAgent: string | undefined, rememberDevice: boolean, now = new Date()): Promise<AuthLoginResult> {
    const sessionToken = createOpaqueToken(48)
    const sessionTtl = rememberDevice ? env.auth.sessionTtlSeconds : env.auth.shortSessionTtlSeconds
    const expiresAt = new Date(now.getTime() + sessionTtl * 1000)

    const session = await this.prisma.$transaction(async (tx) => {
      const device = await tx.device.create({
        data: { userId, deviceName: describeUserAgent(userAgent), userAgent, lastSeenAt: now },
      })
      const created = await tx.session.create({
        data: { userId, deviceId: device.id, tokenHash: hashOpaqueToken(sessionToken), expiresAt, ipAddress, userAgent },
      })
      await tx.user.update({ where: { id: userId }, data: { lastLoginAt: now, loginFailedCount: 0, loginLockedUntil: null } })
      await this.ensureTradingAccounts(tx, userId, 'USD')
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          action: 'LOGIN_SUCCESS',
          entityType: 'Session',
          entityId: created.id,
          ipAddress,
          userAgent,
          metadata: { rememberDevice },
        },
      })
      return created
    })

    await this.createSecurityNotification(userId)
    return { requiresTwoFactor: false, session: { ...user, sessionId: session.id, expiresAt }, sessionToken }
  }

  async verifyTwoFactorChallenge(input: {
    challengeToken: string
    code?: string
    recoveryCode?: string
    rememberDevice?: boolean
    ipAddress?: string
    userAgent?: string
  }): Promise<AuthLoginResult> {
    const challenge = await this.prisma.authToken.findFirst({
      where: { tokenHash: hashOpaqueToken(input.challengeToken), type: 'TWO_FACTOR_CHALLENGE', consumedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    })
    if (!challenge || challenge.user.status !== 'ACTIVE' || !challenge.user.twoFactorEnabled) {
      throw new AuthError(401, 'TWO_FACTOR_CHALLENGE_EXPIRED', 'The two-factor challenge is invalid or expired')
    }

    const hasCode = Boolean(input.code)
    const hasRecoveryCode = Boolean(input.recoveryCode)
    if (hasCode === hasRecoveryCode) {
      throw new AuthError(400, 'TWO_FACTOR_INPUT_REQUIRED', 'Provide a six-digit authenticator code or a recovery code')
    }
    if (hasCode && !/^\d{6}$/.test(input.code ?? '')) {
      throw new AuthError(400, 'INVALID_TWO_FACTOR_CODE', 'Authenticator code must contain exactly six digits')
    }

    let valid = false
    let recoveryRecordId: string | null = null
    if (hasCode) {
      if (!challenge.user.twoFactorSecretEnc) throw new AuthError(503, 'TWO_FACTOR_UNAVAILABLE', 'Two-factor authentication is not configured correctly')
      try {
        valid = verifyTotpCode(decryptTotpSecret(challenge.user.twoFactorSecretEnc, env.auth.twoFactorEncryptionKey), input.code ?? '')
      } catch {
        throw new AuthError(503, 'TWO_FACTOR_UNAVAILABLE', 'Two-factor authentication is not configured correctly')
      }
    } else {
      const normalized = normalizeRecoveryCode(input.recoveryCode ?? '')
      if (normalized.length < 8) valid = false
      else {
        const recovery = await this.prisma.recoveryCode.findFirst({ where: { userId: challenge.userId, codeHash: hashOpaqueToken(normalized), usedAt: null } })
        if (recovery) { valid = true; recoveryRecordId = recovery.id }
      }
    }

    const now = new Date()
    if (!valid) {
      const result = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.authToken.findUnique({ where: { id: challenge.id } })
        if (!latest || latest.consumedAt) return null
        const attempts = latest.attempts + 1
        const exhausted = attempts >= env.auth.twoFactorMaxAttempts
        const updated = await tx.authToken.update({ where: { id: challenge.id }, data: { attempts, consumedAt: exhausted ? now : null } })
        await tx.auditLog.create({
          data: { actorUserId: challenge.userId, action: 'TWO_FACTOR_FAILED', entityType: 'AuthToken', entityId: challenge.id, ipAddress: input.ipAddress, userAgent: input.userAgent, metadata: { attempts } },
        })
        return updated
      })
      if (!result) throw new AuthError(401, 'TWO_FACTOR_CHALLENGE_EXPIRED', 'The two-factor challenge is invalid or expired')
      if (result.consumedAt) throw new AuthError(429, 'TWO_FACTOR_RATE_LIMITED', 'Too many two-factor attempts. Start a new sign-in.', env.auth.twoFactorChallengeTtlSeconds)
      throw new AuthError(401, 'INVALID_TWO_FACTOR_CODE', 'The verification code is incorrect. ' + Math.max(0, env.auth.twoFactorMaxAttempts - result.attempts) + ' attempts remaining.')
    }

    const sessionToken = createOpaqueToken(48)
    const sessionTtl = input.rememberDevice ? env.auth.sessionTtlSeconds : env.auth.shortSessionTtlSeconds
    const expiresAt = new Date(now.getTime() + sessionTtl * 1000)

    const session = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.authToken.findUnique({ where: { id: challenge.id } })
      if (!latest || latest.consumedAt) throw new AuthError(401, 'TWO_FACTOR_CHALLENGE_EXPIRED', 'The two-factor challenge is invalid or expired')
      await tx.authToken.update({ where: { id: challenge.id }, data: { consumedAt: now } })
      if (recoveryRecordId) {
        const used = await tx.recoveryCode.updateMany({ where: { id: recoveryRecordId, userId: challenge.userId, usedAt: null }, data: { usedAt: now } })
        if (used.count !== 1) throw new AuthError(401, 'INVALID_TWO_FACTOR_CODE', 'The recovery code has already been used')
      }
      const device = await tx.device.create({ data: { userId: challenge.userId, deviceName: describeUserAgent(input.userAgent), userAgent: input.userAgent, lastSeenAt: now } })
      const created = await tx.session.create({ data: { userId: challenge.userId, deviceId: device.id, tokenHash: hashOpaqueToken(sessionToken), expiresAt, ipAddress: input.ipAddress, userAgent: input.userAgent } })
      await tx.user.update({ where: { id: challenge.userId }, data: { lastLoginAt: now, loginFailedCount: 0, loginLockedUntil: null } })
      await this.ensureTradingAccounts(tx, challenge.userId, 'USD')
      await tx.auditLog.create({
        data: {
          actorUserId: challenge.userId,
          action: 'LOGIN_SUCCESS',
          entityType: 'Session',
          entityId: created.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: { rememberDevice: input.rememberDevice ?? false, twoFactor: true, recoveryCode: Boolean(recoveryRecordId) },
        },
      })
      return created
    })

    await this.createSecurityNotification(challenge.userId)
    return { requiresTwoFactor: false, session: { ...this.toUser(challenge.user), sessionId: session.id, expiresAt }, sessionToken }
  }

  async getTwoFactorStatus(userId: string): Promise<{ enabled: boolean; recoveryCodesRemaining: number }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } })
    if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'User was not found')
    return { enabled: user.twoFactorEnabled, recoveryCodesRemaining: await this.prisma.recoveryCode.count({ where: { userId, usedAt: null } }) }
  }

  async setupTwoFactor(userId: string): Promise<TwoFactorSetup> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, twoFactorEnabled: true } })
    if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'User was not found')
    if (user.twoFactorEnabled) throw new AuthError(409, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already enabled')
    const secret = generateTotpSecret()
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorPendingSecretEnc: encryptTotpSecret(secret, env.auth.twoFactorEncryptionKey) },
    })
    return { enabled: false, secret, otpauthUri: createOtpAuthUri(secret, 'SL Spot', user.email) }
  }

  async enableTwoFactor(userId: string, code: string): Promise<{ enabled: true; recoveryCodes: string[] }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorPendingSecretEnc: true } })
    if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'User was not found')
    if (user.twoFactorEnabled) throw new AuthError(409, 'TWO_FACTOR_ALREADY_ENABLED', 'Two-factor authentication is already enabled')
    if (!user.twoFactorPendingSecretEnc) throw new AuthError(409, 'TWO_FACTOR_SETUP_REQUIRED', 'Start two-factor setup before enabling it')
    let secret: string
    try { secret = decryptTotpSecret(user.twoFactorPendingSecretEnc, env.auth.twoFactorEncryptionKey) } catch { throw new AuthError(503, 'TWO_FACTOR_UNAVAILABLE', 'Two-factor setup is not available') }
    if (!/^\d{6}$/.test(code)) throw new AuthError(400, 'INVALID_TWO_FACTOR_CODE', 'Authenticator code must contain exactly six digits')
    if (!verifyTotpCode(secret, code)) throw new AuthError(401, 'INVALID_TWO_FACTOR_CODE', 'The authenticator code is incorrect')
    const recoveryCodes = createRecoveryCodes(8)
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: true, twoFactorSecretEnc: user.twoFactorPendingSecretEnc, twoFactorPendingSecretEnc: null } })
      await tx.recoveryCode.deleteMany({ where: { userId } })
      for (const recoveryCode of recoveryCodes) {
        await tx.recoveryCode.create({ data: { userId, codeHash: hashOpaqueToken(normalizeRecoveryCode(recoveryCode)) } })
      }
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'TWO_FACTOR_ENABLED', entityType: 'User', entityId: userId } })
    })
    return { enabled: true, recoveryCodes }
  }

  async disableTwoFactor(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true, twoFactorSecretEnc: true } })
    if (!user) throw new AuthError(404, 'USER_NOT_FOUND', 'User was not found')
    if (!user.twoFactorEnabled || !user.twoFactorSecretEnc) throw new AuthError(409, 'TWO_FACTOR_NOT_ENABLED', 'Two-factor authentication is not enabled')
    let secret: string
    try { secret = decryptTotpSecret(user.twoFactorSecretEnc, env.auth.twoFactorEncryptionKey) } catch { throw new AuthError(503, 'TWO_FACTOR_UNAVAILABLE', 'Two-factor configuration is not available') }
    if (!/^\d{6}$/.test(code)) throw new AuthError(400, 'INVALID_TWO_FACTOR_CODE', 'Authenticator code must contain exactly six digits')
    if (!verifyTotpCode(secret, code)) throw new AuthError(401, 'INVALID_TWO_FACTOR_CODE', 'The authenticator code is incorrect')
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorPendingSecretEnc: null } })
      await tx.recoveryCode.deleteMany({ where: { userId } })
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'TWO_FACTOR_DISABLED', entityType: 'User', entityId: userId } })
    })
  }

  async listDevices(userId: string) {
    return this.prisma.device.findMany({ where: { userId, revokedAt: null }, orderBy: { lastSeenAt: 'desc' }, take: 25, select: { id: true, deviceName: true, userAgent: true, lastSeenAt: true, createdAt: true } })
  }

  async listLoginHistory(userId: string) {
    return this.prisma.auditLog.findMany({ where: { actorUserId: userId, action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_LOCKED'] } }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, ipAddress: true, userAgent: true, createdAt: true, metadata: true } })
  }

  async listSecurityEvents(userId: string) {
    return this.prisma.auditLog.findMany({ where: { actorUserId: userId, action: { in: ['REGISTER', 'EMAIL_VERIFIED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGIN_LOCKED', 'PASSWORD_RESET', 'TWO_FACTOR_CHALLENGE', 'TWO_FACTOR_FAILED', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED', 'SESSION_REVOKED'] } }, orderBy: { createdAt: 'desc' }, take: 75, select: { id: true, action: true, entityType: true, entityId: true, ipAddress: true, userAgent: true, metadata: true, createdAt: true } })
  }

  async authenticateSession(sessionToken: string | undefined): Promise<AuthSession | null> {
    if (!sessionToken) return null
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: hashOpaqueToken(sessionToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        OR: [
          { deviceId: null },
          { device: { revokedAt: null } },
        ],
      },
      include: { user: true, device: true },
    })

    if (!session || session.user.status !== 'ACTIVE') return null

    const now = new Date()
    void this.prisma.session.update({ where: { id: session.id }, data: { updatedAt: now } })
    if (session.deviceId) void this.prisma.device.update({ where: { id: session.deviceId }, data: { lastSeenAt: now } })

    return { ...this.toUser(session.user), sessionId: session.id, expiresAt: session.expiresAt }
  }

  async authenticateWebSocket(request: FastifyRequest): Promise<{ userId: string } | null> {
    const session = await this.authenticateSession(request.cookies?.[env.auth.cookieName])
    return session ? { userId: session.id } : null
  }

  async logout(sessionId: string): Promise<void> {
    const now = new Date()
    const session = await this.prisma.session.findUnique({ where: { id: sessionId }, select: { userId: true, deviceId: true } })
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: now } })
    if (session?.deviceId) await this.prisma.device.update({ where: { id: session.deviceId }, data: { revokedAt: now } })
  }

  async logoutAll(userId: string): Promise<void> {
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })
      await tx.device.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })
    })
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { updatedAt: 'desc' },
      take: 25,
    })

    return sessions.map((session) => ({
      id: session.id,
      deviceId: session.deviceId,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastSeenAt: session.updatedAt,
      expiresAt: session.expiresAt,
      current: session.id === currentSessionId,
    }))
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const now = new Date()
    const session = await this.prisma.session.findFirst({ where: { id: sessionId, userId, revokedAt: null }, select: { deviceId: true } })
    const result = await this.prisma.session.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: now } })
    if (result.count === 0) throw new AuthError(404, 'SESSION_NOT_FOUND', 'Session was not found')
    if (session?.deviceId) await this.prisma.device.update({ where: { id: session.deviceId }, data: { revokedAt: now } })
    await this.writeAudit('SESSION_REVOKED', sessionId, userId)
  }

  async verifyEmail(token: string): Promise<AuthUser> {
    const record = await this.findValidToken(token, 'EMAIL_VERIFICATION')
    if (!record) throw new AuthError(400, 'INVALID_VERIFICATION_TOKEN', 'Verification token is invalid or expired')

    const now = new Date()
    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: record.userId },
        data: { status: 'ACTIVE', emailVerifiedAt: now },
      })
      await tx.authToken.update({ where: { id: record.id }, data: { consumedAt: now } })
      await tx.auditLog.create({
        data: { actorUserId: updated.id, action: 'EMAIL_VERIFIED', entityType: 'User', entityId: updated.id },
      })
      return updated
    })
    return this.toUser(user)
  }

  async requestEmailVerification(emailInput: string): Promise<AuthTokenResult | null> {
    const email = normalizeEmail(emailInput)
    validateEmail(email)
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || user.status !== 'PENDING_VERIFICATION') return null
    return this.issueToken(user.id, 'EMAIL_VERIFICATION', env.auth.verificationTtlSeconds)
  }

  async requestPasswordReset(emailInput: string): Promise<AuthTokenResult | null> {
    const email = normalizeEmail(emailInput)
    validateEmail(email)
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || user.status === 'DISABLED') return null
    return this.issueToken(user.id, 'PASSWORD_RESET', env.auth.passwordResetTtlSeconds)
  }

  async resetPassword(token: string, password: string): Promise<void> {
    validatePassword(password)
    const record = await this.findValidToken(token, 'PASSWORD_RESET')
    if (!record) throw new AuthError(400, 'INVALID_RESET_TOKEN', 'Password reset token is invalid or expired')

    const now = new Date()
    const passwordHash = await hashPassword(password)

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, loginFailedCount: 0, loginLockedUntil: null } })
      await tx.authToken.update({ where: { id: record.id }, data: { consumedAt: now } })
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      })
      await tx.auditLog.create({
        data: { actorUserId: record.userId, action: 'PASSWORD_RESET', entityType: 'User', entityId: record.userId },
      })
    })
  }

  private async issueToken(userId: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET', ttlSeconds: number) {
    const token = createOpaqueToken()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000)

    await this.prisma.$transaction(async (tx) => {
      await tx.authToken.deleteMany({ where: { userId, type, consumedAt: null } })
      await tx.authToken.create({
        data: { userId, type, tokenHash: hashOpaqueToken(token), expiresAt },
      })
    })

    return { token, expiresAt }
  }

  private async findValidToken(token: string, type: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET') {
    return this.prisma.authToken.findFirst({
      where: { tokenHash: hashOpaqueToken(token), type, consumedAt: null, expiresAt: { gt: new Date() } },
    })
  }

  private async ensureTradingAccounts(
    tx: Prisma.TransactionClient,
    userId: string,
    currency: string,
  ): Promise<void> {
    const normalizedCurrency = currency.slice(0, 3).toUpperCase()

    for (const mode of ['DEMO', 'REAL'] as const) {
      const existingAccount = await tx.account.findUnique({
        where: { userId_currency_mode: { userId, currency: normalizedCurrency, mode } },
      })

      if (existingAccount) {
        if (existingAccount.status !== 'ACTIVE') continue

        const existingWallet = await tx.wallet.findUnique({ where: { accountId: existingAccount.id } })
        if (!existingWallet) {
          const initialBalance = mode === 'DEMO'
            ? new Prisma.Decimal(env.trading.initialBalance)
            : new Prisma.Decimal(0)

          const wallet = await tx.wallet.create({
            data: {
              accountId: existingAccount.id,
              currency: existingAccount.currency,
              status: 'ACTIVE',
              availableBalance: initialBalance,
              heldBalance: 0,
            },
          })

          if (initialBalance.gt(0)) {
            const walletLedger = await this.ledger.ensureWalletLedgerAccounts(tx, existingAccount.id, existingAccount.currency)
            const fundingCode = await this.ledger.ensureSystemLedgerAccount(
              tx,
              'SYSTEM:DEMO_FUNDING',
              'Demo funding source',
              'EQUITY',
              existingAccount.currency,
            )
            const walletTransaction = await tx.walletTransaction.create({
              data: {
                walletId: wallet.id,
                type: 'ADJUSTMENT',
                status: 'COMPLETED',
                amount: initialBalance,
                currency: existingAccount.currency,
                idempotencyKey: 'wallet-initial:' + wallet.id,
                referenceType: 'SYSTEM',
                referenceId: wallet.id,
                description: 'Initial demo trading balance',
                availableBalanceAfter: wallet.availableBalance,
                heldBalanceAfter: wallet.heldBalance,
              },
            })
            await this.ledger.postTransaction(tx, {
              walletTransactionId: walletTransaction.id,
              currency: existingAccount.currency,
              referenceType: 'SYSTEM',
              referenceId: wallet.id,
              description: 'Initial demo trading balance',
              lines: [
                {
                  accountCode: fundingCode,
                  accountName: 'Demo funding source',
                  accountType: 'EQUITY',
                  direction: 'DEBIT',
                  amount: initialBalance,
                },
                {
                  accountCode: walletLedger.availableCode,
                  accountName: 'User available balance',
                  accountType: 'LIABILITY',
                  direction: 'CREDIT',
                  amount: initialBalance,
                },
              ],
            })
          }
        }
        continue
      }

      const account = await tx.account.create({
        data: {
          userId,
          name: mode === 'DEMO' ? 'Demo Trading Account' : 'Real Trading Account',
          currency: normalizedCurrency,
          mode,
          status: 'ACTIVE',
        },
      })

      const initialBalance = mode === 'DEMO'
        ? new Prisma.Decimal(env.trading.initialBalance)
        : new Prisma.Decimal(0)

      const wallet = await tx.wallet.create({
        data: {
          accountId: account.id,
          currency: account.currency,
          status: 'ACTIVE',
          availableBalance: initialBalance,
          heldBalance: 0,
        },
      })

      if (initialBalance.gt(0)) {
        const walletLedger = await this.ledger.ensureWalletLedgerAccounts(tx, account.id, account.currency)
        const fundingCode = await this.ledger.ensureSystemLedgerAccount(
          tx,
          'SYSTEM:DEMO_FUNDING',
          'Demo funding source',
          'EQUITY',
          account.currency,
        )
        const walletTransaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'ADJUSTMENT',
            status: 'COMPLETED',
            amount: initialBalance,
            currency: account.currency,
            idempotencyKey: 'wallet-initial:' + wallet.id,
            referenceType: 'SYSTEM',
            referenceId: wallet.id,
            description: 'Initial demo trading balance',
            availableBalanceAfter: wallet.availableBalance,
            heldBalanceAfter: wallet.heldBalance,
          },
        })

        await this.ledger.postTransaction(tx, {
          walletTransactionId: walletTransaction.id,
          currency: account.currency,
          referenceType: 'SYSTEM',
          referenceId: wallet.id,
          description: 'Initial demo trading balance',
          lines: [
            {
              accountCode: fundingCode,
              accountName: 'Demo funding source',
              accountType: 'EQUITY',
              direction: 'DEBIT',
              amount: initialBalance,
            },
            {
              accountCode: walletLedger.availableCode,
              accountName: 'User available balance',
              accountType: 'LIABILITY',
              direction: 'CREDIT',
              amount: initialBalance,
            },
          ],
        })
      }
    }
  }

  private async createSecurityNotification(userId: string): Promise<void> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          type: 'SECURITY',
          title: 'New sign-in',
          body: 'A new sign-in session was created for your SL Spot account.',
        },
      })
      if (!isRedisReady()) return
      await publish(
        env.redisChannel,
        serializeRealtimeEvent(
          createRealtimeEvent('notification.created', {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            body: notification.body,
            readAt: null,
            createdAt: notification.createdAt.toISOString(),
          }, ('user:' + userId) as `user:${string}`),
        ),
      )
    } catch {
      // Security notification delivery is best-effort; login must remain available.
    }
  }

  private async writeAudit(action: string, entityId: string, actorUserId?: string, ipAddress?: string, userAgent?: string) {
    try {
      await this.prisma.auditLog.create({
        data: { actorUserId, action, entityType: 'User', entityId, ipAddress, userAgent },
      })
    } catch {
      // Audit logging must never turn authentication failure into a server error.
    }
  }

  private toUser(user: { id: string; email: string; status: string; countryCode: string | null; emailVerifiedAt: Date | null }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      countryCode: user.countryCode,
      emailVerifiedAt: user.emailVerifiedAt,
    }
  }
}
