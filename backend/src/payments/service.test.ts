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
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
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

test('sandbox methods remain available with sandbox enabled even while real-money gates are closed', async () => {
  const [sandboxCard] = createSandboxProviders('sandbox-test-secret')
  const service = fixture({
    adapter: sandboxCard!,
    payments: { sandbox: true, launchApproved: false, realDepositsEnabled: false, realWithdrawalsEnabled: false },
    adminGate: null,
  })

  assert.deepEqual((await service.listMethods('user-1', 'deposit')).map((method) => method.id), ['card'])
})
