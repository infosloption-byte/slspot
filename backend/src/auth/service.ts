import type { FastifyRequest } from 'fastify'
import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'
import { createOpaqueToken, hashOpaqueToken, hashPassword, verifyPassword } from './crypto.js'
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

export type AuthTokenResult = { token: string; expiresAt: Date }

export class AuthError extends Error {
  readonly statusCode: number
  readonly code: string
  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
    this.code = code
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

export class AuthService {
  private readonly ledger: LedgerService

  constructor(private readonly prisma: PrismaClient) {
    this.ledger = new LedgerService(prisma)
  }

  async register(input: { email: string; password: string; countryCode?: string }) {
    const email = normalizeEmail(input.email)
    validateEmail(email)
    validatePassword(input.password)
    const countryCode = validateCountryCode(input.countryCode)

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
        data: { email, passwordHash, countryCode, status: 'PENDING_VERIFICATION' },
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
        data: { actorUserId: user.id, action: 'REGISTER', entityType: 'User', entityId: user.id },
      })

      return { user, verification: { token, expiresAt } }
    })

    return {
      created: true,
      user: this.toUser(result.user),
      verification: env.auth.exposeDevTokens ? result.verification : null,
    }
  }

  async login(input: { email: string; password: string; ipAddress?: string; userAgent?: string }) {
    const email = normalizeEmail(input.email)
    validateEmail(email)
    const user = await this.prisma.user.findUnique({ where: { email } })

    const dummyHash = await dummyPasswordHashPromise
    const valid = user
      ? await verifyPassword(input.password, user.passwordHash)
      : await verifyPassword(input.password, dummyHash)

    if (!user || !valid) {
      await this.writeAudit('LOGIN_FAILED', email, undefined, input.ipAddress, input.userAgent)
      throw new AuthError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect')
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new AuthError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification is required')
    }
    if (user.status !== 'ACTIVE') {
      throw new AuthError(403, 'ACCOUNT_UNAVAILABLE', 'This account is not available for login')
    }

    const sessionToken = createOpaqueToken(48)
    const expiresAt = new Date(Date.now() + env.auth.sessionTtlSeconds * 1000)

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(sessionToken),
          expiresAt,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      })

      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      await this.ensureTradingAccounts(tx, user.id, 'USD')
      await tx.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'LOGIN_SUCCESS',
          entityType: 'Session',
          entityId: created.id,
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
        },
      })

      return created
    })

    return {
      session: { ...this.toUser(user), sessionId: session.id, expiresAt },
      sessionToken,
    }
  }

  async authenticateSession(sessionToken: string | undefined): Promise<AuthSession | null> {
    if (!sessionToken) return null
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: hashOpaqueToken(sessionToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    })

    if (!session || session.user.status !== 'ACTIVE') return null

    void this.prisma.session.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    })

    return { ...this.toUser(session.user), sessionId: session.id, expiresAt: session.expiresAt }
  }

  async authenticateWebSocket(request: FastifyRequest): Promise<{ userId: string } | null> {
    const session = await this.authenticateSession(request.cookies?.[env.auth.cookieName])
    return session ? { userId: session.id } : null
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
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
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastSeenAt: session.updatedAt,
      expiresAt: session.expiresAt,
      current: session.id === currentSessionId,
    }))
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (result.count === 0) throw new AuthError(404, 'SESSION_NOT_FOUND', 'Session was not found')
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
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })
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
