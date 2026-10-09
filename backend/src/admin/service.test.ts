import assert from 'node:assert/strict'
import test from 'node:test'
import type { PrismaClient } from '../generated/prisma/client.js'
import { AdminError, AdminService } from './service.js'

function adminAccess(role: 'ADMIN' | 'SUPER_ADMIN' = 'ADMIN') {
  return {
    id: 'admin-access-1',
    userId: 'admin-1',
    role,
    user: { id: 'admin-1', email: 'admin@example.com', status: 'ACTIVE' },
  }
}

test('a regular administrator cannot enable REAL trading', async () => {
  let upsertCalled = false
  const prisma = {
    adminAccess: { findUnique: async () => adminAccess('ADMIN') },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      realMoneyGate: {
        findUnique: async () => ({
          id: 'GLOBAL',
          tradingEnabled: false,
          depositsEnabled: false,
          withdrawalsEnabled: false,
          updatedAt: new Date(),
        }),
        upsert: async () => {
          upsertCalled = true
          throw new Error('REAL trading must not be enabled by a regular administrator')
        },
      },
      auditLog: { create: async () => undefined },
    }),
  } as unknown as PrismaClient
  const service = new AdminService(prisma)

  await assert.rejects(
    service.updateRealMoneyGate('admin-1', {
      tradingEnabled: true,
      depositsEnabled: false,
      withdrawalsEnabled: false,
    }),
    (error: unknown) => error instanceof AdminError
      && error.code === 'SUPER_ADMIN_REQUIRED'
      && error.statusCode === 403,
  )
  assert.equal(upsertCalled, false)
})

test('a regular administrator can disable REAL trading and the change is audited', async () => {
  let auditAction = ''
  let auditActor = ''
  const previous = {
    id: 'GLOBAL',
    tradingEnabled: true,
    depositsEnabled: false,
    withdrawalsEnabled: false,
    updatedAt: new Date('2026-10-09T08:00:00.000Z'),
  }
  const prisma = {
    adminAccess: { findUnique: async () => adminAccess('ADMIN') },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      realMoneyGate: {
        findUnique: async () => previous,
        upsert: async ({ update }: { update: typeof previous }) => ({
          ...previous,
          ...update,
          updatedAt: new Date('2026-10-09T09:00:00.000Z'),
        }),
      },
      auditLog: {
        create: async ({ data }: { data: { actorUserId: string; action: string } }) => {
          auditActor = data.actorUserId
          auditAction = data.action
          return { id: 'audit-1' }
        },
      },
    }),
  } as unknown as PrismaClient
  const service = new AdminService(prisma)

  const result = await service.updateRealMoneyGate('admin-1', {
    tradingEnabled: false,
    depositsEnabled: false,
    withdrawalsEnabled: false,
  })

  assert.equal(result.settings.tradingEnabled, false)
  assert.equal(result.effective.tradingEnabled, false)
  assert.equal(auditActor, 'admin-1')
  assert.equal(auditAction, 'ADMIN_REAL_MONEY_GATE_CHANGED')
})
