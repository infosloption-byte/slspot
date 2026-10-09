import assert from 'node:assert/strict'
import test from 'node:test'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { LedgerService } from '../ledger/service.js'
import { PaymentService, PaymentError, type PaymentsConfig } from './service.js'
import { PaymentProviderRegistry } from './registry.js'
import { createSandboxProviders } from './sandbox.js'
import type { PaymentProviderAdapter, ProviderCapabilities } from './types.js'

const baseConfig: PaymentsConfig = {
  blockedCountries: [],
  tier1DepositLimit: '0',
  withdrawalReviewThreshold: '1000',
  withdrawalTurnoverMultiple: '0',
  withdrawalCoolingHours: 0,
  depositExpiryMinutes: 60,
  relaxWithdrawalChecks: false,
  sandbox: false,
  launchApproved: true,
  realDepositsEnabled: true,
  realWithdrawalsEnabled: true,
}

const liveCapabilities: ProviderCapabilities = {
  id: 'live_card',
  displayName: 'Live card provider',
  kind: 'card',
  description: 'Hosted checkout',
  currencies: ['USD'],
  deposit: true,
  withdrawal: true,
  minDeposit: '10',
  maxDeposit: '50000',
  minWithdrawal: '10',
  maxWithdrawal: '50000',
  withdrawalFields: [],
  sandbox: false,
}

function liveAdapter(): PaymentProviderAdapter {
  return {
    capabilities: liveCapabilities,
    createDeposit: async (input) => ({
      providerReference: 'ref_' + input.depositId,
      checkout: { kind: 'redirect', url: 'https://payments.example.test/checkout' },
    }),
    verifyWebhook: () => { throw new Error('Not used in this test') },
    getStatus: async () => ({ status: 'PENDING' }),
    createPayout: async () => ({ providerReference: 'payout_ref', status: 'PROCESSING' }),
  }
}

function configRow(id: string) {
  return {
    id,
    displayName: id === 'card' ? 'Sandbox card' : 'Live card provider',
    enabled: true,
    depositEnabled: true,
    withdrawalEnabled: true,
    minDeposit: '10',
    maxDeposit: '50000',
    minWithdrawal: '10',
    maxWithdrawal: '50000',
    allowedCountries: null,
    blockedCountries: null,
    sortOrder: 10,
  }
}

function fixture(input: {
  adapter: PaymentProviderAdapter
  payments?: Partial<PaymentsConfig>
  adminGate?: { depositsEnabled: boolean; withdrawalsEnabled: boolean } | null
  dateOfBirth?: Date
}) {
  const row = configRow(input.adapter.capabilities.id)
  const prismaMock = {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'trader@example.test',
        status: 'ACTIVE',
        countryCode: 'LK',
        legalName: 'Test Trader',
        dateOfBirth: input.dateOfBirth ?? new Date('1990-01-01T00:00:00.000Z'),
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
        twoFactorEnabled: true,
      }),
    },
    kycCase: { findFirst: async () => null },
    paymentProviderConfig: {
      findMany: async () => [row],
      findUnique: async () => row,
    },
    deposit: {
      findMany: async () => [],
      findUnique: async () => null,
      aggregate: async () => ({ _sum: { amount: null } }),
    },
    realMoneyGate: { findUnique: async () => input.adminGate ?? null },
    $transaction: async () => { throw new Error('Transaction should not be reached in gate tests') },
  } as unknown as PrismaClient

  const registry = new PaymentProviderRegistry()
  registry.register(input.adapter)
  const service = new PaymentService(
    prismaMock,
    registry,
    {} as LedgerService,
    async () => undefined,
    { ...baseConfig, ...input.payments },
  )
  return service
}

test('live payment methods require the database administrator switch as well as environment switches', async () => {
  const service = fixture({
    adapter: liveAdapter(),
    adminGate: { depositsEnabled: false, withdrawalsEnabled: false },
  })

  assert.deepEqual(await service.listMethods('user-1', 'deposit'), [])
  await assert.rejects(
    service.createDeposit('user-1', { provider: 'live_card', amount: '10', clientRequestId: 'gate-test-1' }),
    (error: unknown) => error instanceof PaymentError && error.code === 'PAYMENT_OPERATION_DISABLED',
  )
})

test('live payment methods appear only when both gates allow that operation', async () => {
  const service = fixture({
    adapter: liveAdapter(),
    adminGate: { depositsEnabled: true, withdrawalsEnabled: false },
  })

  assert.deepEqual((await service.listMethods('user-1', 'deposit')).map((method) => method.id), ['live_card'])
  assert.deepEqual(await service.listMethods('user-1', 'withdrawal'), [])
})

test('service rejects deposit creation for an underage profile before wallet transaction', async () => {
  const [sandboxCard] = createSandboxProviders('sandbox-age-test-secret')
  const service = fixture({
    adapter: sandboxCard!,
    payments: { sandbox: true },
    adminGate: null,
    dateOfBirth: new Date('2012-05-01T00:00:00.000Z'),
  })

  await assert.rejects(
    service.createDeposit('user-1', { provider: 'card', amount: '10', clientRequestId: 'age-gate-test' }),
    (error: unknown) => error instanceof PaymentError && error.code === 'AGE_RESTRICTED',
  )
})

test('providers that do not support USD cannot appear or accept payment requests', async () => {
  const adapter: PaymentProviderAdapter = {
    ...liveAdapter(),
    capabilities: { ...liveCapabilities, currencies: ['EUR'] },
  }
  const service = fixture({
    adapter,
    adminGate: { depositsEnabled: true, withdrawalsEnabled: true },
  })

  assert.deepEqual(await service.listMethods('user-1', 'deposit'), [])
  await assert.rejects(
    service.createDeposit('user-1', { provider: 'live_card', amount: '10', clientRequestId: 'currency-test' }),
    (error: unknown) => error instanceof PaymentError && error.code === 'PROVIDER_NOT_FOUND',
  )
})

test('provider methods cannot be enabled for an operation the adapter does not support', async () => {
  const adapter: PaymentProviderAdapter = {
    ...liveAdapter(),
    capabilities: { ...liveCapabilities, withdrawal: false },
  }
  const service = fixture({
    adapter,
    adminGate: { depositsEnabled: true, withdrawalsEnabled: true },
  })

  assert.deepEqual(await service.listMethods('user-1', 'withdrawal'), [])
  assert.deepEqual((await service.listMethods('user-1', 'deposit')).map((method) => method.id), ['live_card'])
})

test('does not credit a deposit from a completion webhook missing amount or currency', async () => {
  let walletCredits = 0
  const paymentEvent = { id: 'payment-event-incomplete-deposit', processedAt: null as Date | null, error: null as string | null }
  const adapter: PaymentProviderAdapter = {
    ...liveAdapter(),
    verifyWebhook: () => ({
      eventId: 'event-incomplete-deposit',
      type: 'deposit.completed',
      providerReference: 'deposit-provider-ref',
    }),
  }
  const prismaMock = {
    paymentEvent: {
      findUnique: async () => null,
      create: async () => paymentEvent,
      update: async ({ data }: { data: Partial<typeof paymentEvent> }) => {
        Object.assign(paymentEvent, data)
        return paymentEvent
      },
    },
    deposit: {
      findFirst: async () => ({
        id: 'deposit-1',
        amount: { toString: () => '25.00' },
        currency: 'USD',
        wallet: { account: { id: 'account-1', userId: 'user-1' } },
      }),
      updateMany: async () => { walletCredits += 1; return { count: 1 } },
    },
    auditLog: { create: async () => ({ id: 'audit-incomplete-deposit' }) },
  } as unknown as PrismaClient
  const registry = new PaymentProviderRegistry()
  registry.register(adapter)
  const service = new PaymentService(prismaMock, registry, {} as LedgerService, async () => undefined, baseConfig)

  await assert.rejects(
    service.handleWebhook('live_card', '{}', {}),
    (error: unknown) => error instanceof PaymentError && error.code === 'INCOMPLETE_PROVIDER_EVENT',
  )
  assert.equal(walletCredits, 0)
  assert.equal(paymentEvent.processedAt, null)
  assert.match(paymentEvent.error ?? '', /amount and currency/)
})

test('does not finalize a payout from a completion webhook missing amount or currency', async () => {
  let finalized = 0
  const paymentEvent = { id: 'payment-event-incomplete-withdrawal', processedAt: null as Date | null, error: null as string | null }
  const adapter: PaymentProviderAdapter = {
    ...liveAdapter(),
    verifyWebhook: () => ({
      eventId: 'event-incomplete-withdrawal',
      type: 'withdrawal.completed',
      providerReference: 'withdrawal-provider-ref',
    }),
  }
  const prismaMock = {
    paymentEvent: {
      findUnique: async () => null,
      create: async () => paymentEvent,
      update: async ({ data }: { data: Partial<typeof paymentEvent> }) => {
        Object.assign(paymentEvent, data)
        return paymentEvent
      },
    },
    withdrawal: {
      findFirst: async () => ({
        id: 'withdrawal-1',
        amount: { toString: () => '25.00' },
        currency: 'USD',
        wallet: { account: { id: 'account-1', userId: 'user-1' } },
      }),
      updateMany: async () => { finalized += 1; return { count: 1 } },
    },
    auditLog: { create: async () => ({ id: 'audit-incomplete-withdrawal' }) },
  } as unknown as PrismaClient
  const registry = new PaymentProviderRegistry()
  registry.register(adapter)
  const service = new PaymentService(prismaMock, registry, {} as LedgerService, async () => undefined, baseConfig)

  await assert.rejects(
    service.handleWebhook('live_card', '{}', {}),
    (error: unknown) => error instanceof PaymentError && error.code === 'INCOMPLETE_PROVIDER_EVENT',
  )
  assert.equal(finalized, 0)
  assert.equal(paymentEvent.processedAt, null)
  assert.match(paymentEvent.error ?? '', /amount and currency/)
})

test('retries an unmatched signed webhook after the payment reference becomes visible', async () => {
  let notifications = 0
  const eventRecord: {
    id: string
    provider: string
    payload: unknown
    processedAt: Date | null
    error: string | null
    createdAt: Date
  } = {
    id: 'payment-event-early-1',
    provider: liveCapabilities.id,
    payload: {
      event: {
        eventId: 'event-early-1',
        type: 'deposit.failed',
        providerReference: 'provider-ref-early-1',
        amount: '25.00',
        currency: 'USD',
        reason: 'Declined by provider',
      },
      raw: '{}',
    },
    processedAt: null,
    error: 'No matching payment for reference',
    createdAt: new Date('2026-10-09T10:00:00.000Z'),
  }
  const deposit = {
    id: 'deposit-early-1',
    amount: { toString: () => '25.00' },
    currency: 'USD',
    wallet: { account: { id: 'account-1', userId: 'user-1' } },
  }
  const prismaMock = {
    paymentEvent: {
      findMany: async () => eventRecord.processedAt === null ? [{ ...eventRecord }] : [],
      updateMany: async () => ({ count: eventRecord.processedAt === null ? 1 : 0 }),
      update: async ({ data }: { data: Partial<typeof eventRecord> }) => {
        Object.assign(eventRecord, data)
        return eventRecord
      },
    },
    deposit: {
      findFirst: async () => deposit,
      updateMany: async () => ({ count: 1 }),
    },
    auditLog: { create: async () => ({ id: 'audit-early-1' }) },
  } as unknown as PrismaClient
  const registry = new PaymentProviderRegistry()
  registry.register(liveAdapter())
  const service = new PaymentService(
    prismaMock,
    registry,
    {} as LedgerService,
    async () => { notifications += 1 },
    baseConfig,
  )

  assert.equal(await service.retryUnmatchedPaymentEvents(), 1)
  assert.ok(eventRecord.processedAt instanceof Date)
  assert.equal(eventRecord.error, null)
  assert.equal(notifications, 1)
  assert.equal(await service.retryUnmatchedPaymentEvents(), 0)
  assert.equal(notifications, 1)
})

test('withdrawal reconciliation leaves funds untouched while the provider still reports pending', async () => {
  let writes = 0
  const withdrawal = {
    id: 'withdrawal-pending-1',
    provider: liveCapabilities.id,
    providerReference: 'provider-ref-1',
    status: 'PROCESSING',
    amount: { toString: () => '25.00' },
    currency: 'USD',
    destination: 'Live card provider · •••• 4242',
    details: null,
    failureReason: null,
    requestedAt: new Date('2026-10-09T10:00:00.000Z'),
    completedAt: null,
  }
  const adapter: PaymentProviderAdapter = {
    ...liveAdapter(),
    getStatus: async () => ({ status: 'PENDING' }),
  }
  const prismaMock = {
    withdrawal: {
      findUnique: async () => ({ ...withdrawal }),
      findUniqueOrThrow: async () => ({ ...withdrawal }),
      updateMany: async () => { writes += 1; return { count: 1 } },
    },
    auditLog: { create: async () => ({ id: 'audit-1' }) },
  } as unknown as PrismaClient
  const registry = new PaymentProviderRegistry()
  registry.register(adapter)
  const service = new PaymentService(
    prismaMock,
    registry,
    {} as LedgerService,
    async () => undefined,
    baseConfig,
  )

  const result = await service.reconcileWithdrawal('admin-1', withdrawal.id)
  assert.equal(result.providerStatus, 'PENDING')
  assert.equal(result.withdrawal.status, 'PROCESSING')
  assert.equal(writes, 0)
})

test('withdrawal reconciliation does not refund when provider status lookup fails', async () => {
  let writes = 0
  const withdrawal = {
    id: 'withdrawal-uncertain-1',
    provider: liveCapabilities.id,
    providerReference: 'provider-ref-2',
    status: 'PROCESSING',
    amount: { toString: () => '25.00' },
    currency: 'USD',
    destination: null,
    details: null,
    failureReason: null,
    requestedAt: new Date('2026-10-09T10:00:00.000Z'),
    completedAt: null,
  }
  const adapter: PaymentProviderAdapter = {
    ...liveAdapter(),
    getStatus: async () => { throw new Error('provider timeout') },
  }
  const prismaMock = {
    withdrawal: {
      findUnique: async () => ({ ...withdrawal }),
      findUniqueOrThrow: async () => ({ ...withdrawal }),
      updateMany: async () => { writes += 1; return { count: 1 } },
    },
    auditLog: { create: async () => ({ id: 'audit-2' }) },
  } as unknown as PrismaClient
  const registry = new PaymentProviderRegistry()
  registry.register(adapter)
  const service = new PaymentService(
    prismaMock,
    registry,
    {} as LedgerService,
    async () => undefined,
    baseConfig,
  )

  await assert.rejects(
    service.reconcileWithdrawal('admin-1', withdrawal.id),
    (error: unknown) => error instanceof PaymentError && error.code === 'PROVIDER_STATUS_UNAVAILABLE',
  )
  assert.equal(writes, 0)
})

test('sandbox methods remain available with sandbox enabled even while real-money gates are closed', async () => {
  const [sandboxCard] = createSandboxProviders('sandbox-test-secret')
  const service = fixture({
    adapter: sandboxCard!,
    payments: { sandbox: true, launchApproved: false, realDepositsEnabled: false, realWithdrawalsEnabled: false },
    adminGate: null,
  })

  assert.deepEqual((await service.listMethods('user-1', 'deposit')).map((method) => method.id), ['card'])
})
