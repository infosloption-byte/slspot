import { Prisma, type PrismaClient } from '../generated/prisma/client.js'
import type { LedgerService } from '../ledger/service.js'
import { PaymentProviderRegistry } from './registry.js'
import {
  ageOn,
  computeKycTier,
  evaluateDeposit,
  evaluateWithdrawal,
  isPaymentProviderOperationAllowed,
  maskDestination,
  missingProfileFields,
  toUnits,
  validateDetails,
  withdrawalNeedsReview,
  type KycTier,
  type RuleBlocker,
} from './rules.js'
import {
  InvalidWebhookSignatureError,
  PayoutRejectedError,
  type Checkout,
  type NormalizedEvent,
  type PaymentDirection,
  type PaymentProviderAdapter,
  type PaymentUser,
  type ProviderField,
  type WebhookHeaders,
} from './types.js'

export class PaymentError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'PaymentError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export type PaymentsConfig = {
  blockedCountries: readonly string[]
  tier1DepositLimit: string
  withdrawalReviewThreshold: string
  withdrawalTurnoverMultiple: string
  withdrawalCoolingHours: number
  depositExpiryMinutes: number
  relaxWithdrawalChecks: boolean
  sandbox: boolean
  launchApproved: boolean
  realDepositsEnabled: boolean
  realWithdrawalsEnabled: boolean
}

type Notify = (userId: string, type: 'DEPOSIT' | 'WITHDRAWAL', title: string, body: string) => Promise<unknown>
type LoggerLike = { warn: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void; info: (obj: object, msg?: string) => void }

const CURRENCY = 'USD'
const SECURITY_CHANGE_ACTIONS = ['PASSWORD_CHANGED', 'PASSWORD_RESET', 'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DISABLED']
const SETTLED_TRADE_STATUSES = ['WON', 'LOST', 'DRAW'] as const

export type PaymentMethod = {
  id: string
  displayName: string
  kind: string
  description: string
  currencies: string[]
  minAmount: string
  maxAmount: string | null
  sandbox: boolean
  fields: ProviderField[]
  /** Withdrawals only: false when the user has not deposited with this method. */
  eligible: boolean
  reason?: string
}

export type ApiDeposit = {
  id: string
  provider: string
  status: string
  amount: string
  currency: string
  providerReference: string | null
  checkout: Checkout | null
  expiresAt: string | null
  failureReason: string | null
  requestedAt: string
  completedAt: string | null
}

export type ApiWithdrawal = {
  id: string
  provider: string
  status: string
  amount: string
  currency: string
  destination: string | null
  needsReview: boolean
  failureReason: string | null
  requestedAt: string
  completedAt: string | null
}

export type Eligibility = {
  tier: KycTier
  emailVerified: boolean
  profile: { legalName: string | null; dateOfBirth: string | null; countryCode: string | null }
  missingProfile: string[]
  twoFactorEnabled: boolean
  kycStatus: string
  depositBlockers: RuleBlocker[]
  withdrawalBlockers: RuleBlocker[]
  sandbox: boolean
}

type UserFacts = {
  user: PaymentUser
  emailVerified: boolean
  legalName: string | null
  dateOfBirth: Date | null
  twoFactorEnabled: boolean
  kycApproved: boolean
  kycStatus: string
  tier: KycTier
  age: number | null
  missingProfile: string[]
}

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value)
}

function parseAmount(value: string): string {
  const normalized = value.trim()
  if (!/^\d{1,20}(?:\.\d{1,8})?$/.test(normalized) || toUnits(normalized) <= 0n) {
    throw new PaymentError(400, 'INVALID_AMOUNT', 'Enter an amount greater than zero with at most 8 decimal places')
  }
  return normalized
}

function providerAccountCode(provider: string): string {
  return 'SYSTEM:PAYMENTS:' + provider.toUpperCase()
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
}

function countryList(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.toUpperCase()) : []
}

export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly registry: PaymentProviderRegistry,
    private readonly ledger: LedgerService,
    private readonly notify: Notify,
    private readonly config: PaymentsConfig,
    private readonly logger: LoggerLike = { warn: () => undefined, error: () => undefined, info: () => undefined },
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Make sure each registered adapter has a config row. Existing rows (edited by an admin) are never overwritten. */
  async syncProviderConfigs(): Promise<void> {
    for (const adapter of this.registry.list()) {
      const capabilities = adapter.capabilities
      const existing = await this.prisma.paymentProviderConfig.findUnique({ where: { id: capabilities.id } })
      if (existing) continue
      await this.prisma.paymentProviderConfig.create({
        data: {
          id: capabilities.id,
          displayName: capabilities.displayName,
          enabled: true,
          depositEnabled: capabilities.deposit,
          withdrawalEnabled: capabilities.withdrawal,
          minDeposit: decimal(capabilities.minDeposit),
          maxDeposit: capabilities.maxDeposit ? decimal(capabilities.maxDeposit) : null,
          minWithdrawal: decimal(capabilities.minWithdrawal),
          maxWithdrawal: capabilities.maxWithdrawal ? decimal(capabilities.maxWithdrawal) : null,
          sortOrder: this.registry.list().indexOf(adapter) * 10 + 10,
        },
      })
    }
  }

  // ---------------------------------------------------------------- reads

  async getEligibility(userId: string): Promise<Eligibility> {
    const facts = await this.loadFacts(userId)
    const completedDeposits = await this.sumDeposits(userId)
    const depositBlockers = evaluateDeposit({
      tier: facts.tier,
      age: facts.age,
      emailVerified: facts.emailVerified,
      missingProfile: facts.missingProfile,
      countryCode: facts.user.countryCode,
      blockedCountries: this.config.blockedCountries,
      amount: '0',
      completedDeposits,
      tier1DepositLimit: this.config.tier1DepositLimit,
    })
    const withdrawalBlockers = evaluateWithdrawal(await this.withdrawalRuleInput(facts, userId, '0', true, '0'))
      // The balance is shown on the wallet; the checklist is about what the user still has to do.
      .filter((blocker) => blocker.code !== 'INSUFFICIENT_FUNDS')
    return {
      tier: facts.tier,
      emailVerified: facts.emailVerified,
      profile: {
        legalName: facts.legalName,
        dateOfBirth: facts.dateOfBirth ? facts.dateOfBirth.toISOString().slice(0, 10) : null,
        countryCode: facts.user.countryCode,
      },
      missingProfile: facts.missingProfile,
      twoFactorEnabled: facts.twoFactorEnabled,
      kycStatus: facts.kycStatus,
      depositBlockers,
      withdrawalBlockers,
      sandbox: this.registry.list().some((adapter) => adapter.capabilities.sandbox),
    }
  }

  async listMethods(userId: string, direction: PaymentDirection): Promise<PaymentMethod[]> {
    const facts = await this.loadFacts(userId)
    const configs = await this.prisma.paymentProviderConfig.findMany({ orderBy: { sortOrder: 'asc' } })
    const usedForDeposit = direction === 'withdrawal' ? await this.depositedProviders(userId) : new Set<string>()
    const methods: PaymentMethod[] = []
    const hasLiveProvider = configs.some((config) => {
      const adapter = this.registry.get(config.id)
      return Boolean(adapter && !adapter.capabilities.sandbox)
    })
    const adminGate = hasLiveProvider
      ? await this.prisma.realMoneyGate.findUnique({
          where: { id: 'GLOBAL' },
          select: { depositsEnabled: true, withdrawalsEnabled: true },
        })
      : null

    for (const config of configs) {
      const adapter = this.registry.get(config.id)
      if (!adapter || !config.enabled || !this.providerOperationAllowed(adapter, direction, adminGate)) continue
      if (direction === 'deposit' ? !adapter.capabilities.deposit : !adapter.capabilities.withdrawal) continue
      if (direction === 'deposit' ? !config.depositEnabled : !config.withdrawalEnabled) continue
      if (!this.countryAllowed(config, facts.user.countryCode)) continue
      const capabilities = adapter.capabilities
      if (!capabilities.currencies.includes(CURRENCY)) continue
      const eligible = direction === 'deposit' || usedForDeposit.has(config.id)
      methods.push({
        id: config.id,
        displayName: config.displayName,
        kind: capabilities.kind,
        description: capabilities.description,
        currencies: capabilities.currencies,
        minAmount: (direction === 'deposit' ? config.minDeposit : config.minWithdrawal).toString(),
        maxAmount: (direction === 'deposit' ? config.maxDeposit : config.maxWithdrawal)?.toString() ?? null,
        sandbox: capabilities.sandbox,
        fields: direction === 'withdrawal' ? capabilities.withdrawalFields : [],
        eligible,
        ...(eligible ? {} : { reason: 'Withdrawals go back to a method you have deposited with.' }),
      })
    }
    return methods
  }

  async getDeposit(userId: string, depositId: string): Promise<ApiDeposit> {
    const deposit = await this.prisma.deposit.findFirst({ where: { id: depositId, wallet: { account: { userId } } } })
    if (!deposit) throw new PaymentError(404, 'DEPOSIT_NOT_FOUND', 'Deposit not found')
    return this.toApiDeposit(deposit)
  }

  async getWithdrawal(userId: string, withdrawalId: string): Promise<ApiWithdrawal> {
    const withdrawal = await this.prisma.withdrawal.findFirst({ where: { id: withdrawalId, wallet: { account: { userId } } } })
    if (!withdrawal) throw new PaymentError(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found')
    return this.toApiWithdrawal(withdrawal)
  }

  // -------------------------------------------------------------- deposits

  async createDeposit(userId: string, input: { provider: string; amount: string; clientRequestId: string }): Promise<ApiDeposit> {
    const requestId = input.clientRequestId.trim()
    if (!requestId) throw new PaymentError(400, 'INVALID_IDEMPOTENCY_KEY', 'A client request ID is required')
    const amount = parseAmount(input.amount)
    const idempotencyKey = 'deposit:' + userId + ':' + requestId

    const existing = await this.prisma.deposit.findUnique({ where: { idempotencyKey } })
    if (existing) return this.toApiDeposit(existing)

    const facts = await this.loadFacts(userId)
    const { adapter, config } = await this.resolveProvider(input.provider, 'deposit', facts.user.countryCode)
    this.assertWithinLimits(amount, config.minDeposit, config.maxDeposit)

    const blockers = evaluateDeposit({
      tier: facts.tier,
      age: facts.age,
      emailVerified: facts.emailVerified,
      missingProfile: facts.missingProfile,
      countryCode: facts.user.countryCode,
      blockedCountries: this.config.blockedCountries,
      amount,
      completedDeposits: await this.sumDeposits(userId),
      tier1DepositLimit: this.config.tier1DepositLimit,
    })
    this.throwIfBlocked(blockers)

    let deposit: Prisma.DepositGetPayload<object>
    try {
      deposit = await this.prisma.$transaction(async (tx) => {
        const { wallet } = await this.ensureRealWallet(tx, userId)
        return tx.deposit.create({
          data: {
            walletId: wallet.id,
            provider: adapter.capabilities.id,
            amount: decimal(amount),
            currency: CURRENCY,
            status: 'PENDING',
            idempotencyKey,
            expiresAt: new Date(this.now().getTime() + this.config.depositExpiryMinutes * 60_000),
            requestedAt: this.now(),
          },
        })
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const raced = await this.prisma.deposit.findUnique({ where: { idempotencyKey } })
      if (raced) return this.toApiDeposit(raced)
      throw error
    }

    try {
      const result = await adapter.createDeposit({ depositId: deposit.id, amount, currency: CURRENCY, user: facts.user })
      deposit = await this.prisma.deposit.update({
        where: { id: deposit.id },
        data: {
          providerReference: result.providerReference,
          details: { checkout: result.checkout } as Prisma.InputJsonValue,
          ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
        },
      })
    } catch (error) {
      await this.prisma.deposit.updateMany({
        where: { id: deposit.id, status: 'PENDING' },
        data: { status: 'FAILED', failureReason: 'The payment provider could not start the payment' },
      })
      this.logger.error({ err: error, provider: adapter.capabilities.id, depositId: deposit.id }, 'Provider rejected deposit creation')
      throw new PaymentError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider could not start this payment. Try again or choose another method.')
    }

    await this.audit(userId, 'DEPOSIT_CREATED', 'Deposit', deposit.id, { provider: deposit.provider, amount, currency: CURRENCY })
    return this.toApiDeposit(deposit)
  }

  async cancelDeposit(userId: string, depositId: string): Promise<ApiDeposit> {
    const deposit = await this.prisma.deposit.findFirst({ where: { id: depositId, wallet: { account: { userId } } } })
    if (!deposit) throw new PaymentError(404, 'DEPOSIT_NOT_FOUND', 'Deposit not found')
    const updated = await this.prisma.deposit.updateMany({
      where: { id: deposit.id, status: 'PENDING' },
      data: { status: 'FAILED', failureReason: 'Cancelled by you' },
    })
    if (updated.count !== 1) throw new PaymentError(409, 'DEPOSIT_NOT_CANCELLABLE', 'This deposit can no longer be cancelled')
    await this.audit(userId, 'DEPOSIT_CANCELLED', 'Deposit', deposit.id, {})
    return this.getDeposit(userId, deposit.id)
  }

  /** Mark deposits the user never completed at the provider. Meant to run on a timer. */
  async expireStaleDeposits(): Promise<number> {
    const result = await this.prisma.deposit.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: this.now() } },
      data: { status: 'FAILED', failureReason: 'Expired before payment was completed' },
    })
    return result.count
  }

  // ----------------------------------------------------------- withdrawals

  async createWithdrawal(
    userId: string,
    input: { provider: string; amount: string; details: Record<string, unknown>; clientRequestId: string },
  ): Promise<ApiWithdrawal> {
    const requestId = input.clientRequestId.trim()
    if (!requestId) throw new PaymentError(400, 'INVALID_IDEMPOTENCY_KEY', 'A client request ID is required')
    const amount = parseAmount(input.amount)
    const idempotencyKey = 'withdrawal:' + userId + ':' + requestId

    const existing = await this.prisma.withdrawal.findUnique({ where: { idempotencyKey } })
    if (existing) return this.toApiWithdrawal(existing)

    const facts = await this.loadFacts(userId)
    const { adapter, config } = await this.resolveProvider(input.provider, 'withdrawal', facts.user.countryCode)
    this.assertWithinLimits(amount, config.minWithdrawal, config.maxWithdrawal)

    const validated = validateDetails(adapter.capabilities.withdrawalFields, input.details)
    if (!validated.ok) throw new PaymentError(422, 'INVALID_DETAILS', 'Check the payout details', validated.errors)

    const providerUsedForDeposit = (await this.depositedProviders(userId)).has(adapter.capabilities.id)
    const wallet = await this.prisma.wallet.findFirst({ where: { account: { userId, mode: 'REAL', currency: CURRENCY } } })
    const blockers = evaluateWithdrawal(await this.withdrawalRuleInput(
      facts, userId, amount, providerUsedForDeposit, wallet?.availableBalance.toString() ?? '0',
    ))
    this.throwIfBlocked(blockers)

    const needsReview = withdrawalNeedsReview(amount, this.config.withdrawalReviewThreshold)
    const destination = maskDestination(adapter.capabilities.displayName, validated.value)

    let withdrawalId: string
    try {
      withdrawalId = await this.prisma.$transaction(async (tx) => {
        const { account, wallet: realWallet } = await this.ensureRealWallet(tx, userId)
        const claimed = await tx.wallet.updateMany({
          where: { id: realWallet.id, status: 'ACTIVE', availableBalance: { gte: decimal(amount) } },
          data: { availableBalance: { decrement: decimal(amount) } },
        })
        if (claimed.count !== 1) throw new PaymentError(422, 'INSUFFICIENT_FUNDS', 'Your available balance is lower than the amount requested.')
        const updatedWallet = await tx.wallet.findUniqueOrThrow({ where: { id: realWallet.id } })

        const withdrawal = await tx.withdrawal.create({
          data: {
            walletId: realWallet.id,
            provider: adapter.capabilities.id,
            amount: decimal(amount),
            currency: CURRENCY,
            destination,
            details: { ...validated.value, needsReview } as Prisma.InputJsonValue,
            status: 'PENDING',
            idempotencyKey,
            requestedAt: this.now(),
          },
        })
        const walletTransaction = await tx.walletTransaction.create({
          data: {
            walletId: realWallet.id,
            type: 'WITHDRAWAL',
            status: 'PENDING',
            amount: decimal(amount).neg(),
            currency: CURRENCY,
            idempotencyKey: 'payment-withdrawal:' + withdrawal.id,
            referenceType: 'WITHDRAWAL',
            referenceId: withdrawal.id,
            description: 'Withdrawal to ' + destination,
            availableBalanceAfter: updatedWallet.availableBalance,
            heldBalanceAfter: updatedWallet.heldBalance,
          },
        })
        const codes = await this.ledger.ensureWalletLedgerAccounts(tx, account.id, CURRENCY)
        const providerCode = await this.ledger.ensureSystemLedgerAccount(tx, providerAccountCode(adapter.capabilities.id), adapter.capabilities.displayName + ' funds', 'ASSET', CURRENCY)
        await this.ledger.postTransaction(tx, {
          walletTransactionId: walletTransaction.id,
          currency: CURRENCY,
          referenceType: 'WITHDRAWAL',
          referenceId: withdrawal.id,
          description: 'Withdrawal requested',
          lines: [
            { accountCode: codes.availableCode, accountName: 'User available balance', accountType: 'LIABILITY', direction: 'DEBIT', amount },
            { accountCode: providerCode, accountName: adapter.capabilities.displayName + ' funds', accountType: 'ASSET', direction: 'CREDIT', amount },
          ],
        })
        await tx.withdrawal.update({ where: { id: withdrawal.id }, data: { walletTransactionId: walletTransaction.id } })
        return withdrawal.id
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const raced = await this.prisma.withdrawal.findUnique({ where: { idempotencyKey } })
      if (raced) return this.toApiWithdrawal(raced)
      throw error
    }

    await this.audit(userId, 'WITHDRAWAL_REQUESTED', 'Withdrawal', withdrawalId, { provider: adapter.capabilities.id, amount, currency: CURRENCY, needsReview })
    if (needsReview) {
      await this.safeNotify(userId, 'WITHDRAWAL', 'Withdrawal under review', 'Your withdrawal of ' + amount + ' ' + CURRENCY + ' is being reviewed. It will be sent once approved.')
    } else {
      await this.dispatchWithdrawal(withdrawalId)
    }
    return this.getWithdrawal(userId, withdrawalId)
  }

  async cancelWithdrawal(userId: string, withdrawalId: string): Promise<ApiWithdrawal> {
    const withdrawal = await this.prisma.withdrawal.findFirst({ where: { id: withdrawalId, wallet: { account: { userId } } } })
    if (!withdrawal) throw new PaymentError(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found')
    const refunded = await this.refundWithdrawal(withdrawal.id, 'REJECTED', 'Cancelled by you', ['PENDING'])
    if (!refunded) throw new PaymentError(409, 'WITHDRAWAL_NOT_CANCELLABLE', 'This withdrawal can no longer be cancelled')
    await this.audit(userId, 'WITHDRAWAL_CANCELLED', 'Withdrawal', withdrawal.id, {})
    return this.getWithdrawal(userId, withdrawal.id)
  }

  async listWithdrawalsForReview(status: 'PENDING' | 'PROCESSING' = 'PENDING', page = 1, pageSize = 25) {
    const where = { status, ...(status === 'PENDING' ? { reviewedAt: null } : {}) }
    const [total, items] = await Promise.all([
      this.prisma.withdrawal.count({ where }),
      this.prisma.withdrawal.findMany({
        where,
        orderBy: { requestedAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { wallet: { include: { account: { include: { user: { select: { id: true, email: true, legalName: true, countryCode: true } } } } } } },
      }),
    ])
    return {
      items: items.map((item) => ({
        ...this.toApiWithdrawal(item),
        user: item.wallet.account.user,
        details: item.details,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    }
  }

  /**
   * Re-check a payout whose provider outcome is still uncertain. This is an explicit admin action so an
   * unresolved request is never refunded merely because a webhook was delayed. Only a definitive provider
   * result can settle or refund funds; PENDING/PROCESSING leaves the wallet and ledger untouched.
   */
  async reconcileWithdrawal(
    adminUserId: string,
    withdrawalId: string,
  ): Promise<{ withdrawal: ApiWithdrawal; providerStatus: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' }> {
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id: withdrawalId } })
    if (!withdrawal) throw new PaymentError(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found')
    if (withdrawal.status !== 'PROCESSING') {
      throw new PaymentError(409, 'WITHDRAWAL_NOT_PROCESSING', 'Only a processing withdrawal can be reconciled')
    }
    if (!withdrawal.providerReference) {
      throw new PaymentError(409, 'PROVIDER_REFERENCE_MISSING', 'The provider has not returned a payout reference; this request needs manual investigation')
    }
    const adapter = this.registry.get(withdrawal.provider)
    if (!adapter) {
      throw new PaymentError(409, 'PROVIDER_NOT_CONFIGURED', 'The original provider is not configured. Do not refund this request until its outcome is confirmed.')
    }

    let providerStatus: Awaited<ReturnType<PaymentProviderAdapter['getStatus']>>
    try {
      providerStatus = await adapter.getStatus('withdrawal', withdrawal.providerReference)
    } catch (error) {
      this.logger.error({ err: error, withdrawalId, provider: withdrawal.provider }, 'Withdrawal status lookup failed; no wallet changes were made')
      await this.audit(adminUserId, 'WITHDRAWAL_RECONCILIATION_FAILED', 'Withdrawal', withdrawalId, {
        provider: withdrawal.provider,
        reason: 'Provider status lookup failed',
      })
      throw new PaymentError(502, 'PROVIDER_STATUS_UNAVAILABLE', 'The provider status could not be confirmed. The withdrawal remains processing and no refund was issued.')
    }

    if (providerStatus.status === 'COMPLETED') {
      await this.finalizeWithdrawal(withdrawalId)
    } else if (providerStatus.status === 'FAILED') {
      const refunded = await this.refundWithdrawal(
        withdrawalId,
        'FAILED',
        (providerStatus.reason ?? 'Provider confirmed that the payout failed').slice(0, 255),
        ['PROCESSING'],
        adminUserId,
      )
      if (!refunded) throw new PaymentError(409, 'WITHDRAWAL_STATE_CHANGED', 'The withdrawal changed while it was being reconciled. Refresh its status.')
    }

    await this.audit(adminUserId, 'WITHDRAWAL_RECONCILED', 'Withdrawal', withdrawalId, {
      provider: withdrawal.provider,
      providerStatus: providerStatus.status,
      outcome: providerStatus.status === 'COMPLETED' ? 'completed' : providerStatus.status === 'FAILED' ? 'refunded' : 'still_processing',
    })
    const updated = await this.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } })
    if (providerStatus.status === 'COMPLETED' && updated.status !== 'COMPLETED') {
      throw new PaymentError(409, 'WITHDRAWAL_STATE_CHANGED', 'The provider reports completion, but the local withdrawal state changed concurrently. Investigate the request before taking any further action.')
    }
    return { withdrawal: this.toApiWithdrawal(updated), providerStatus: providerStatus.status }
  }

  async approveWithdrawal(adminUserId: string, withdrawalId: string): Promise<ApiWithdrawal> {
    const withdrawal = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: { include: { account: { select: { userId: true, status: true } } } } },
    })
    if (!withdrawal) throw new PaymentError(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found')
    if (withdrawal.status !== 'PENDING' || withdrawal.reviewedAt !== null) {
      throw new PaymentError(409, 'WITHDRAWAL_NOT_PENDING', 'This withdrawal is not waiting for review')
    }
    // Two people must be involved in moving a customer's money out, unless this is a local test run.
    if (withdrawal.wallet.account.userId === adminUserId && !this.config.relaxWithdrawalChecks) {
      throw new PaymentError(403, 'SELF_APPROVAL_NOT_ALLOWED', 'You cannot approve your own withdrawal')
    }

    // The user, provider config, environment flag and administrator gate may have changed since
    // the original request. Re-check before recording approval or contacting the provider.
    if (withdrawal.wallet.account.status !== 'ACTIVE') {
      throw new PaymentError(403, 'ACCOUNT_NOT_ELIGIBLE', 'The trading account is not active')
    }
    const userId = withdrawal.wallet.account.userId
    const facts = await this.loadFacts(userId)
    const { adapter, config } = await this.resolveProvider(withdrawal.provider, 'withdrawal', facts.user.countryCode)
    this.assertWithinLimits(withdrawal.amount.toString(), config.minWithdrawal, config.maxWithdrawal)

    const details = validateDetails(adapter.capabilities.withdrawalFields, this.storedDetails(withdrawal.details))
    if (!details.ok) throw new PaymentError(409, 'INVALID_STORED_DETAILS', 'The stored payout details no longer satisfy provider requirements; review them before approving.')

    const providerUsedForDeposit = (await this.depositedProviders(userId)).has(adapter.capabilities.id)
    const wallet = await this.prisma.wallet.findUnique({ where: { id: withdrawal.walletId } })
    if (!wallet || wallet.status !== 'ACTIVE') {
      throw new PaymentError(403, 'WALLET_NOT_ELIGIBLE', 'The customer wallet is not active')
    }
    const availableForEligibility = wallet.availableBalance.add(withdrawal.amount).toString()
    const blockers = evaluateWithdrawal(await this.withdrawalRuleInput(
      facts, userId, withdrawal.amount.toString(), providerUsedForDeposit, availableForEligibility,
    ))
    this.throwIfBlocked(blockers)

    const marked = await this.prisma.withdrawal.updateMany({
      where: { id: withdrawal.id, status: 'PENDING', reviewedAt: null },
      data: { reviewedByUserId: adminUserId, reviewedAt: this.now() },
    })
    if (marked.count !== 1) throw new PaymentError(409, 'WITHDRAWAL_NOT_PENDING', 'This withdrawal is not waiting for review')
    await this.audit(adminUserId, 'WITHDRAWAL_APPROVED', 'Withdrawal', withdrawal.id, { ownerUserId: withdrawal.wallet.account.userId })
    await this.dispatchWithdrawal(withdrawal.id)
    return this.toApiWithdrawal(await this.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } }))
  }

  async rejectWithdrawal(adminUserId: string, withdrawalId: string, reason: string): Promise<ApiWithdrawal> {
    const cleanReason = reason.trim().slice(0, 255)
    if (!cleanReason) throw new PaymentError(400, 'REASON_REQUIRED', 'A reason is required')
    const withdrawal = await this.prisma.withdrawal.findUnique({ where: { id: withdrawalId } })
    if (!withdrawal) throw new PaymentError(404, 'WITHDRAWAL_NOT_FOUND', 'Withdrawal not found')
    const refunded = await this.refundWithdrawal(withdrawal.id, 'REJECTED', cleanReason, ['PENDING'], adminUserId)
    if (!refunded) throw new PaymentError(409, 'WITHDRAWAL_NOT_PENDING', 'This withdrawal is not waiting for review')
    await this.audit(adminUserId, 'WITHDRAWAL_REJECTED', 'Withdrawal', withdrawal.id, { reason: cleanReason })
    return this.toApiWithdrawal(await this.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } }))
  }

  // -------------------------------------------------------------- webhooks

  /**
   * One entry point for every provider. The adapter checks the signature over the raw body; the event is
   * stored under a unique (provider, eventId) so a replay is acknowledged without being applied twice.
   */
  async handleWebhook(providerId: string, rawBody: string, headers: WebhookHeaders): Promise<{ status: 'processed' | 'duplicate' | 'ignored' }> {
    const adapter = this.registry.get(providerId)
    if (!adapter) throw new PaymentError(404, 'PROVIDER_NOT_FOUND', 'Unknown payment provider')

    let event: NormalizedEvent
    try {
      event = adapter.verifyWebhook(rawBody, headers)
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        this.logger.warn({ provider: providerId, reason: error.message }, 'Rejected payment webhook')
        throw new PaymentError(401, 'INVALID_SIGNATURE', 'Webhook signature is invalid')
      }
      throw error
    }

    let record = await this.prisma.paymentEvent.findUnique({ where: { provider_eventId: { provider: providerId, eventId: event.eventId } } })
    if (record?.processedAt) return { status: 'duplicate' }
    if (!record) {
      try {
        record = await this.prisma.paymentEvent.create({
          data: {
            provider: providerId,
            eventId: event.eventId,
            type: event.type,
            providerReference: event.providerReference,
            payload: { event, raw: rawBody.slice(0, 8_000) } as unknown as Prisma.InputJsonValue,
          },
        })
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
        record = await this.prisma.paymentEvent.findUnique({ where: { provider_eventId: { provider: providerId, eventId: event.eventId } } })
        if (record?.processedAt) return { status: 'duplicate' }
      }
    }

    let outcome: 'processed' | 'ignored'
    try {
      outcome = event.type.startsWith('deposit.')
        ? await this.applyDepositEvent(providerId, event)
        : await this.applyWithdrawalEvent(providerId, event)
    } catch (error) {
      // Leave the event unprocessed so the provider's retry is applied (all transitions are guarded).
      if (record) await this.prisma.paymentEvent.update({ where: { id: record.id }, data: { error: String(error instanceof Error ? error.message : error).slice(0, 255) } })
      throw error
    }
    if (record) {
      await this.prisma.paymentEvent.update({
        where: { id: record.id },
        // Unknown references can be a legitimate create/webhook race. Keep the signed normalized
        // event retryable until the payment row's provider reference is visible.
        data: {
          processedAt: outcome === 'processed' ? this.now() : null,
          error: outcome === 'ignored' ? 'No matching payment for reference' : null,
        },
      })
    }
    return { status: outcome }
  }

  /**
   * Retry a small batch of valid, signed webhook events that arrived before their payment reference
   * was persisted. State transitions remain conditional/idempotent, so replaying a batch is safe.
   */
  async retryUnmatchedPaymentEvents(limit = 50): Promise<number> {
    const take = Math.min(100, Math.max(1, Math.trunc(limit)))
    const records = await this.prisma.paymentEvent.findMany({
      where: {
        processedAt: null,
        error: { in: ['No matching payment for reference', 'Retry pending payment event'] },
        // Give up on references that never appear instead of retrying them every minute forever.
        createdAt: { gte: new Date(this.now().getTime() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'asc' },
      take,
    })
    let processed = 0

    for (const record of records) {
      // The state transitions below are conditional/idempotent, so retries need no durable lease.
      // Avoid a permanent 'claimed' marker if the process exits while an event is being applied.

      const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
        ? record.payload as Prisma.JsonObject
        : null
      const eventValue = payload?.event
      if (!eventValue || typeof eventValue !== 'object' || Array.isArray(eventValue)) {
        await this.prisma.paymentEvent.update({
          where: { id: record.id },
          data: { error: 'Stored webhook event is malformed' },
        })
        continue
      }

      const event = eventValue as unknown as NormalizedEvent
      try {
        const outcome = event.type.startsWith('deposit.')
          ? await this.applyDepositEvent(record.provider, event)
          : await this.applyWithdrawalEvent(record.provider, event)
        await this.prisma.paymentEvent.update({
          where: { id: record.id },
          data: {
            processedAt: outcome === 'processed' ? this.now() : null,
            error: outcome === 'ignored' ? 'No matching payment for reference' : null,
          },
        })
        if (outcome === 'processed') processed += 1
      } catch (error) {
        await this.prisma.paymentEvent.update({
          where: { id: record.id },
          data: { error: 'Retry pending payment event' },
        }).catch((updateError: unknown) => {
          this.logger.error({ err: updateError, paymentEventId: record.id }, 'Could not update unmatched payment event after retry failure')
        })
        this.logger.error({ err: error, paymentEventId: record.id, provider: record.provider }, 'Retrying unmatched payment event failed')
      }
    }

    return processed
  }

  // ------------------------------------------------------------ internals

  private async applyDepositEvent(providerId: string, event: NormalizedEvent): Promise<'processed' | 'ignored'> {
    const deposit = await this.prisma.deposit.findFirst({
      where: { provider: providerId, providerReference: event.providerReference },
      include: { wallet: { include: { account: { select: { id: true, userId: true } } } } },
    })
    if (!deposit) {
      this.logger.warn({ provider: providerId, reference: event.providerReference }, 'Webhook for unknown deposit')
      return 'ignored'
    }
    const userId = deposit.wallet.account.userId

    if (event.type === 'deposit.pending') {
      await this.prisma.deposit.updateMany({ where: { id: deposit.id, status: 'PENDING' }, data: { status: 'PROCESSING' } })
      return 'processed'
    }

    if (event.type === 'deposit.failed') {
      const failed = await this.prisma.deposit.updateMany({
        where: { id: deposit.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'FAILED', failureReason: (event.reason ?? 'The payment was not completed').slice(0, 255) },
      })
      if (failed.count === 1) {
        await this.audit(userId, 'DEPOSIT_FAILED', 'Deposit', deposit.id, { reason: event.reason ?? null })
        await this.safeNotify(userId, 'DEPOSIT', 'Deposit not completed', 'Your deposit of ' + deposit.amount.toString() + ' ' + deposit.currency + ' was not completed. No money was taken.')
      }
      return 'processed'
    }

    // A deposit completion must include amount and currency so a signed reference alone cannot
    // credit a wallet when an adapter omitted the settlement details.
    if (event.amount === undefined || event.currency === undefined) {
      this.logger.error({ provider: providerId, depositId: deposit.id, eventId: event.eventId }, 'Deposit completion is missing amount or currency; manual review required')
      await this.audit(userId, 'DEPOSIT_WEBHOOK_INCOMPLETE', 'Deposit', deposit.id, { provider: providerId, eventId: event.eventId })
      throw new PaymentError(422, 'INCOMPLETE_PROVIDER_EVENT', 'The provider completion event must include amount and currency')
    }

    let receivedAmount: bigint
    try {
      receivedAmount = toUnits(event.amount)
    } catch {
      throw new PaymentError(422, 'INVALID_PROVIDER_AMOUNT', 'The provider completion event contains an invalid amount')
    }
    if (receivedAmount !== toUnits(deposit.amount.toString()) || event.currency.trim().toUpperCase() !== deposit.currency) {
      await this.prisma.deposit.updateMany({
        where: { id: deposit.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'REJECTED', failureReason: 'Amount or currency did not match the request' },
      })
      this.logger.error({ provider: providerId, depositId: deposit.id, expected: deposit.amount.toString(), received: event.amount, expectedCurrency: deposit.currency, receivedCurrency: event.currency }, 'Deposit amount/currency mismatch; needs manual review')
      await this.audit(userId, 'DEPOSIT_AMOUNT_MISMATCH', 'Deposit', deposit.id, { expected: deposit.amount.toString(), received: event.amount, expectedCurrency: deposit.currency, receivedCurrency: event.currency })
      return 'processed'
    }

    const credited = await this.prisma.$transaction(async (tx) => {
      // A provider's completion is the last word, so a deposit we expired or cancelled locally is still credited.
      const claimed = await tx.deposit.updateMany({
        where: { id: deposit.id, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
        data: { status: 'COMPLETED', completedAt: this.now(), failureReason: null },
      })
      if (claimed.count !== 1) return false

      const walletUpdated = await tx.wallet.updateMany({
        where: { id: deposit.walletId, status: 'ACTIVE' },
        data: { availableBalance: { increment: deposit.amount } },
      })
      if (walletUpdated.count !== 1) throw new PaymentError(409, 'WALLET_NOT_ACTIVE', 'The wallet could not be credited')
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: deposit.walletId } })

      const walletTransaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amount: deposit.amount,
          currency: deposit.currency,
          idempotencyKey: 'payment-deposit:' + deposit.id,
          referenceType: 'DEPOSIT',
          referenceId: deposit.id,
          description: 'Deposit via ' + providerId,
          availableBalanceAfter: wallet.availableBalance,
          heldBalanceAfter: wallet.heldBalance,
        },
      })
      const codes = await this.ledger.ensureWalletLedgerAccounts(tx, deposit.wallet.account.id, deposit.currency)
      const adapter = this.registry.get(providerId)
      const providerCode = await this.ledger.ensureSystemLedgerAccount(tx, providerAccountCode(providerId), (adapter?.capabilities.displayName ?? providerId) + ' funds', 'ASSET', deposit.currency)
      await this.ledger.postTransaction(tx, {
        walletTransactionId: walletTransaction.id,
        currency: deposit.currency,
        referenceType: 'DEPOSIT',
        referenceId: deposit.id,
        description: 'Deposit via ' + providerId,
        lines: [
          { accountCode: providerCode, accountName: (adapter?.capabilities.displayName ?? providerId) + ' funds', accountType: 'ASSET', direction: 'DEBIT', amount: deposit.amount },
          { accountCode: codes.availableCode, accountName: 'User available balance', accountType: 'LIABILITY', direction: 'CREDIT', amount: deposit.amount },
        ],
      })
      await tx.deposit.update({ where: { id: deposit.id }, data: { walletTransactionId: walletTransaction.id } })
      return true
    })

    if (credited) {
      await this.audit(userId, 'DEPOSIT_COMPLETED', 'Deposit', deposit.id, { provider: providerId, amount: deposit.amount.toString(), currency: deposit.currency })
      await this.safeNotify(userId, 'DEPOSIT', 'Deposit completed', 'Your wallet was credited with ' + deposit.amount.toString() + ' ' + deposit.currency + '.')
    }
    return 'processed'
  }

  private async applyWithdrawalEvent(providerId: string, event: NormalizedEvent): Promise<'processed' | 'ignored'> {
    const withdrawal = await this.prisma.withdrawal.findFirst({
      where: { provider: providerId, providerReference: event.providerReference },
      include: { wallet: { include: { account: { select: { userId: true } } } } },
    })
    if (!withdrawal) {
      this.logger.warn({ provider: providerId, reference: event.providerReference }, 'Webhook for unknown withdrawal')
      return 'ignored'
    }
    if (event.type === 'withdrawal.completed') {
      if (event.amount === undefined || event.currency === undefined) {
        this.logger.error({ provider: providerId, withdrawalId: withdrawal.id, eventId: event.eventId }, 'Withdrawal completion is missing amount or currency; manual review required')
        await this.audit(withdrawal.wallet.account.userId, 'WITHDRAWAL_WEBHOOK_INCOMPLETE', 'Withdrawal', withdrawal.id, { provider: providerId, eventId: event.eventId })
        throw new PaymentError(422, 'INCOMPLETE_PROVIDER_EVENT', 'The provider payout completion event must include amount and currency')
      }
      let receivedAmount: bigint
      try {
        receivedAmount = toUnits(event.amount)
      } catch {
        throw new PaymentError(422, 'INVALID_PROVIDER_AMOUNT', 'The provider payout completion event contains an invalid amount')
      }
      if (receivedAmount !== toUnits(withdrawal.amount.toString()) || event.currency.trim().toUpperCase() !== withdrawal.currency) {
        this.logger.error({ provider: providerId, withdrawalId: withdrawal.id, expected: withdrawal.amount.toString(), received: event.amount, expectedCurrency: withdrawal.currency, receivedCurrency: event.currency }, 'Withdrawal amount/currency mismatch; payout needs manual review')
        await this.audit(withdrawal.wallet.account.userId, 'WITHDRAWAL_AMOUNT_MISMATCH', 'Withdrawal', withdrawal.id, { expected: withdrawal.amount.toString(), received: event.amount, expectedCurrency: withdrawal.currency, receivedCurrency: event.currency })
        throw new PaymentError(409, 'WITHDRAWAL_AMOUNT_MISMATCH', 'The provider payout amount or currency does not match the request; manual review is required')
      }
      await this.finalizeWithdrawal(withdrawal.id)
    } else {
      await this.refundWithdrawal(withdrawal.id, 'FAILED', (event.reason ?? 'The provider could not complete the payout').slice(0, 255), ['PROCESSING'])
    }
    return 'processed'
  }

  /** Send an approved (or auto-approved) withdrawal to its provider. */
  private async dispatchWithdrawal(withdrawalId: string): Promise<void> {
    const claimed = await this.prisma.withdrawal.updateMany({ where: { id: withdrawalId, status: 'PENDING' }, data: { status: 'PROCESSING' } })
    if (claimed.count !== 1) return
    const withdrawal = await this.prisma.withdrawal.findUniqueOrThrow({
      where: { id: withdrawalId },
      include: { wallet: { include: { account: { include: { user: { select: { id: true, email: true, countryCode: true } } } } } } },
    })
    const adapter = this.registry.get(withdrawal.provider)
    const user = withdrawal.wallet.account.user
    if (!adapter) {
      this.logger.error({ withdrawalId, provider: withdrawal.provider }, 'No adapter for provider; withdrawal left in PROCESSING for manual handling')
      return
    }
    const details = this.storedDetails(withdrawal.details)

    try {
      const result = await adapter.createPayout({
        withdrawalId,
        amount: withdrawal.amount.toString(),
        currency: withdrawal.currency,
        details,
        user: { id: user.id, email: user.email, countryCode: user.countryCode },
      })
      await this.prisma.withdrawal.update({ where: { id: withdrawalId }, data: { providerReference: result.providerReference } })
      if (result.status === 'COMPLETED') await this.finalizeWithdrawal(withdrawalId)
    } catch (error) {
      if (error instanceof PayoutRejectedError) {
        await this.refundWithdrawal(withdrawalId, 'FAILED', error.message.slice(0, 255), ['PROCESSING'])
        return
      }
      // We cannot tell whether the provider paid. Refunding could pay the user twice, so the withdrawal stays
      // PROCESSING for reconciliation / an operator, and the problem is logged and audited.
      this.logger.error({ err: error, withdrawalId, provider: withdrawal.provider }, 'Payout outcome unknown; withdrawal needs reconciliation')
      await this.audit(user.id, 'WITHDRAWAL_PAYOUT_UNCERTAIN', 'Withdrawal', withdrawalId, { provider: withdrawal.provider })
    }
  }

  private async finalizeWithdrawal(withdrawalId: string): Promise<void> {
    const result = await this.prisma.$transaction(async (tx) => {
      const done = await tx.withdrawal.updateMany({
        where: { id: withdrawalId, status: 'PROCESSING' },
        data: { status: 'COMPLETED', completedAt: this.now() },
      })
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { wallet: { include: { account: { select: { userId: true } } } } },
      })
      if (!withdrawal || withdrawal.status !== 'COMPLETED') return null

      // The payout state and wallet transaction status must commit together. Without the
      // original wallet transaction we cannot safely mark the payout complete.
      if (!withdrawal.walletTransactionId) {
        throw new PaymentError(409, 'WALLET_TRANSACTION_MISSING', 'The wallet transaction for this payout is missing; manual reconciliation is required.')
      }
      await tx.walletTransaction.update({
        where: { id: withdrawal.walletTransactionId },
        data: { status: 'COMPLETED' },
      })

      return {
        transitioned: done.count === 1,
        userId: withdrawal.wallet.account.userId,
        amount: withdrawal.amount.toString(),
        currency: withdrawal.currency,
        destination: withdrawal.destination,
        provider: withdrawal.provider,
      }
    })

    if (!result || !result.transitioned) return
    await this.audit(result.userId, 'WITHDRAWAL_COMPLETED', 'Withdrawal', withdrawalId, {
      provider: result.provider,
      amount: result.amount,
    })
    await this.safeNotify(
      result.userId,
      'WITHDRAWAL',
      'Withdrawal completed',
      'Your withdrawal of ' + result.amount + ' ' + result.currency + ' to ' + (result.destination ?? 'your saved payment method') + ' was sent.',
    )
  }

  /** Give the held funds back to the user. Returns false when the withdrawal was not in an allowed state. */
  private async refundWithdrawal(
    withdrawalId: string,
    finalStatus: 'REJECTED' | 'FAILED',
    reason: string,
    allowedFrom: Array<'PENDING' | 'PROCESSING'>,
    reviewerId?: string,
  ): Promise<boolean> {
    const result = await this.prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { wallet: { include: { account: { select: { id: true, userId: true } } } } },
      })
      if (!withdrawal) return null
      const claimed = await tx.withdrawal.updateMany({
        where: { id: withdrawalId, status: { in: allowedFrom } },
        data: {
          status: finalStatus,
          failureReason: reason,
          ...(reviewerId ? { reviewedByUserId: reviewerId, reviewedAt: this.now() } : {}),
        },
      })
      if (claimed.count !== 1) return null

      await tx.wallet.update({ where: { id: withdrawal.walletId }, data: { availableBalance: { increment: withdrawal.amount } } })
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: withdrawal.walletId } })
      const refund = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          status: 'COMPLETED',
          amount: withdrawal.amount,
          currency: withdrawal.currency,
          idempotencyKey: 'payment-withdrawal-refund:' + withdrawalId,
          referenceType: 'WITHDRAWAL_REFUND',
          referenceId: withdrawalId,
          description: 'Withdrawal refunded: ' + reason,
          availableBalanceAfter: wallet.availableBalance,
          heldBalanceAfter: wallet.heldBalance,
        },
      })
      const codes = await this.ledger.ensureWalletLedgerAccounts(tx, withdrawal.wallet.account.id, withdrawal.currency)
      const providerCode = await this.ledger.ensureSystemLedgerAccount(tx, providerAccountCode(withdrawal.provider), withdrawal.provider + ' funds', 'ASSET', withdrawal.currency)
      await this.ledger.postTransaction(tx, {
        walletTransactionId: refund.id,
        currency: withdrawal.currency,
        referenceType: 'WITHDRAWAL_REFUND',
        referenceId: withdrawalId,
        description: 'Withdrawal refunded',
        lines: [
          { accountCode: providerCode, accountName: withdrawal.provider + ' funds', accountType: 'ASSET', direction: 'DEBIT', amount: withdrawal.amount },
          { accountCode: codes.availableCode, accountName: 'User available balance', accountType: 'LIABILITY', direction: 'CREDIT', amount: withdrawal.amount },
        ],
      })
      if (withdrawal.walletTransactionId) {
        await tx.walletTransaction.update({ where: { id: withdrawal.walletTransactionId }, data: { status: finalStatus } })
      }
      await tx.withdrawal.update({ where: { id: withdrawalId }, data: { refundWalletTransactionId: refund.id } })
      return { userId: withdrawal.wallet.account.userId, amount: withdrawal.amount.toString(), currency: withdrawal.currency }
    })
    if (!result) return false
    await this.audit(result.userId, 'WITHDRAWAL_REFUNDED', 'Withdrawal', withdrawalId, { status: finalStatus, reason })
    await this.safeNotify(result.userId, 'WITHDRAWAL', 'Withdrawal not sent', 'Your withdrawal of ' + result.amount + ' ' + result.currency + ' was not sent (' + reason + '). The full amount was returned to your wallet.')
    return true
  }

  private async loadFacts(userId: string): Promise<UserFacts> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, countryCode: true, legalName: true, dateOfBirth: true, emailVerifiedAt: true, twoFactorEnabled: true },
    })
    if (!user) throw new PaymentError(404, 'USER_NOT_FOUND', 'User not found')
    if (user.status !== 'ACTIVE') throw new PaymentError(403, 'ACCOUNT_NOT_ELIGIBLE', 'Your account is not active')
    const kycCase = await this.prisma.kycCase.findFirst({ where: { userId }, orderBy: { updatedAt: 'desc' }, select: { status: true } })
    const kycApproved = kycCase?.status === 'APPROVED'
    const profile = { emailVerified: Boolean(user.emailVerifiedAt), legalName: user.legalName, dateOfBirth: user.dateOfBirth, countryCode: user.countryCode }
    return {
      user: { id: user.id, email: user.email, countryCode: user.countryCode },
      emailVerified: profile.emailVerified,
      legalName: user.legalName,
      dateOfBirth: user.dateOfBirth,
      twoFactorEnabled: user.twoFactorEnabled,
      kycApproved,
      kycStatus: kycCase?.status ?? 'NOT_STARTED',
      tier: computeKycTier({ ...profile, kycApproved }),
      age: user.dateOfBirth ? ageOn(user.dateOfBirth, this.now()) : null,
      missingProfile: missingProfileFields(profile),
    }
  }

  private async withdrawalRuleInput(facts: UserFacts, userId: string, amount: string, providerUsedForDeposit: boolean, available: string) {
    const [totalDeposited, totalTraded, lastChange] = await Promise.all([
      this.sumDeposits(userId),
      this.sumTradedStake(userId),
      this.prisma.auditLog.findFirst({
        where: { actorUserId: userId, action: { in: SECURITY_CHANGE_ACTIONS } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ])
    return {
      tier: facts.tier,
      age: facts.age,
      twoFactorEnabled: facts.twoFactorEnabled,
      countryCode: facts.user.countryCode,
      blockedCountries: this.config.blockedCountries,
      amount,
      available,
      providerUsedForDeposit,
      totalDeposited,
      totalTraded,
      turnoverMultiple: this.config.withdrawalTurnoverMultiple,
      lastSecurityChangeAt: lastChange?.createdAt ?? null,
      coolingHours: this.config.withdrawalCoolingHours,
      now: this.now(),
      relaxed: this.config.relaxWithdrawalChecks,
    }
  }

  private async sumDeposits(userId: string): Promise<string> {
    const result = await this.prisma.deposit.aggregate({
      where: { status: 'COMPLETED', wallet: { account: { userId, mode: 'REAL' } } },
      _sum: { amount: true },
    })
    return (result._sum.amount ?? new Prisma.Decimal(0)).toString()
  }

  private async sumTradedStake(userId: string): Promise<string> {
    const result = await this.prisma.position.aggregate({
      where: { userId, account: { mode: 'REAL' }, trade: { status: { in: [...SETTLED_TRADE_STATUSES] } } },
      _sum: { amount: true },
    })
    return (result._sum.amount ?? new Prisma.Decimal(0)).toString()
  }

  private async depositedProviders(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.deposit.findMany({
      where: { status: 'COMPLETED', wallet: { account: { userId, mode: 'REAL' } } },
      distinct: ['provider'],
      select: { provider: true },
    })
    return new Set(rows.map((row) => row.provider))
  }

  private async resolveProvider(providerId: string, direction: PaymentDirection, countryCode: string | null) {
    const adapter = this.registry.get(providerId)
    if (!adapter) throw new PaymentError(404, 'PROVIDER_NOT_FOUND', 'That payment method is not available')
    const supportsOperation = direction === 'deposit' ? adapter.capabilities.deposit : adapter.capabilities.withdrawal
    if (!supportsOperation) throw new PaymentError(404, 'PROVIDER_NOT_FOUND', 'That payment method is not available for this operation')
    if (!adapter.capabilities.currencies.includes(CURRENCY)) {
      throw new PaymentError(404, 'PROVIDER_NOT_FOUND', 'That payment method does not support ' + CURRENCY)
    }
    const adminGate = adapter.capabilities.sandbox
      ? null
      : await this.prisma.realMoneyGate.findUnique({
          where: { id: 'GLOBAL' },
          select: { depositsEnabled: true, withdrawalsEnabled: true },
        })
    if (!this.providerOperationAllowed(adapter, direction, adminGate)) {
      throw new PaymentError(403, 'PAYMENT_OPERATION_DISABLED', direction === 'deposit'
        ? 'Deposits are disabled for this provider until the environment and administrator launch gates are enabled.'
        : 'Withdrawals are disabled for this provider until the environment and administrator launch gates are enabled.')
    }
    const config = await this.prisma.paymentProviderConfig.findUnique({ where: { id: providerId } })
    const enabled = config?.enabled && (direction === 'deposit' ? config.depositEnabled : config.withdrawalEnabled)
    if (!config || !enabled || !this.countryAllowed(config, countryCode)) {
      throw new PaymentError(404, 'PROVIDER_NOT_FOUND', 'That payment method is not available')
    }
    return { adapter: adapter as PaymentProviderAdapter, config }
  }

  private providerOperationAllowed(
    adapter: PaymentProviderAdapter,
    direction: PaymentDirection,
    adminGate: { depositsEnabled: boolean; withdrawalsEnabled: boolean } | null,
  ): boolean {
    // The environment forbids sandbox providers in production. They intentionally bypass the
    // real-money launch switches so local test flows remain usable before launch approval.
    if (adapter.capabilities.sandbox) return this.config.sandbox

    return isPaymentProviderOperationAllowed({
      direction,
      providerIsSandbox: false,
      sandboxModeEnabled: false,
      launchApproved: this.config.launchApproved,
      depositsEnabled: this.config.realDepositsEnabled && adminGate?.depositsEnabled === true,
      withdrawalsEnabled: this.config.realWithdrawalsEnabled && adminGate?.withdrawalsEnabled === true,
    })
  }

  private countryAllowed(config: { allowedCountries: Prisma.JsonValue | null; blockedCountries: Prisma.JsonValue | null }, countryCode: string | null): boolean {
    const allowed = countryList(config.allowedCountries)
    const blocked = countryList(config.blockedCountries)
    const country = countryCode?.toUpperCase() ?? null
    if (country && blocked.includes(country)) return false
    if (allowed.length > 0) return country !== null && allowed.includes(country)
    return true
  }

  private assertWithinLimits(amount: string, min: Prisma.Decimal, max: Prisma.Decimal | null): void {
    if (toUnits(amount) < toUnits(min.toString())) throw new PaymentError(422, 'AMOUNT_TOO_LOW', 'The minimum for this method is ' + min.toString() + ' ' + CURRENCY)
    if (max && toUnits(amount) > toUnits(max.toString())) throw new PaymentError(422, 'AMOUNT_TOO_HIGH', 'The maximum for this method is ' + max.toString() + ' ' + CURRENCY)
  }

  private throwIfBlocked(blockers: RuleBlocker[]): void {
    const first = blockers[0]
    if (first) throw new PaymentError(422, first.code, first.message, blockers)
  }

  private async ensureRealWallet(tx: Prisma.TransactionClient, userId: string) {
    let account = await tx.account.findUnique({ where: { userId_currency_mode: { userId, currency: CURRENCY, mode: 'REAL' } } })
    if (!account) {
      account = await tx.account.create({ data: { userId, name: 'Real Trading Account', currency: CURRENCY, mode: 'REAL', status: 'ACTIVE' } })
    }
    if (account.status !== 'ACTIVE') throw new PaymentError(403, 'ACCOUNT_NOT_ELIGIBLE', 'The trading account is not active')
    let wallet = await tx.wallet.findUnique({ where: { accountId: account.id } })
    if (!wallet) {
      wallet = await tx.wallet.create({ data: { accountId: account.id, currency: CURRENCY, status: 'ACTIVE', availableBalance: 0, heldBalance: 0 } })
    }
    return { account, wallet }
  }

  private storedDetails(value: Prisma.JsonValue | null): Record<string, string> {
    const out: Record<string, string> = {}
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, item] of Object.entries(value)) if (typeof item === 'string') out[key] = item
    }
    return out
  }

  private async audit(userId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { actorUserId: userId, action, entityType, entityId, metadata: metadata as Prisma.InputJsonValue } })
    } catch (error) {
      this.logger.error({ err: error, action, entityId }, 'Could not write payment audit log')
    }
  }

  private async safeNotify(userId: string, type: 'DEPOSIT' | 'WITHDRAWAL', title: string, body: string): Promise<void> {
    try {
      await this.notify(userId, type, title, body)
    } catch (error) {
      this.logger.warn({ err: error, userId }, 'Could not send payment notification')
    }
  }

  private toApiDeposit(deposit: {
    id: string; provider: string; status: string; amount: Prisma.Decimal; currency: string; providerReference: string | null
    details: Prisma.JsonValue | null; expiresAt: Date | null; failureReason: string | null; requestedAt: Date; completedAt: Date | null
  }): ApiDeposit {
    const details = deposit.details && typeof deposit.details === 'object' && !Array.isArray(deposit.details) ? deposit.details : null
    return {
      id: deposit.id,
      provider: deposit.provider,
      status: deposit.status,
      amount: deposit.amount.toString(),
      currency: deposit.currency,
      providerReference: deposit.providerReference,
      checkout: details && 'checkout' in details ? (details.checkout as unknown as Checkout) : null,
      expiresAt: deposit.expiresAt?.toISOString() ?? null,
      failureReason: deposit.failureReason,
      requestedAt: deposit.requestedAt.toISOString(),
      completedAt: deposit.completedAt?.toISOString() ?? null,
    }
  }

  private toApiWithdrawal(withdrawal: {
    id: string; provider: string; status: string; amount: Prisma.Decimal; currency: string; destination: string | null
    details: Prisma.JsonValue | null; failureReason: string | null; requestedAt: Date; completedAt: Date | null
  }): ApiWithdrawal {
    const details = withdrawal.details && typeof withdrawal.details === 'object' && !Array.isArray(withdrawal.details) ? withdrawal.details : null
    return {
      id: withdrawal.id,
      provider: withdrawal.provider,
      status: withdrawal.status,
      amount: withdrawal.amount.toString(),
      currency: withdrawal.currency,
      destination: withdrawal.destination,
      needsReview: Boolean(details && 'needsReview' in details && details.needsReview === true),
      failureReason: withdrawal.failureReason,
      requestedAt: withdrawal.requestedAt.toISOString(),
      completedAt: withdrawal.completedAt?.toISOString() ?? null,
    }
  }
}
