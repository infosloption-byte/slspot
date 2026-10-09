import assert from 'node:assert/strict'
import test from 'node:test'
import type { PrismaClient } from '../generated/prisma/client.js'
import { PlatformApiService } from './service.js'

test('notification inbox selects only columns required by the list response', async () => {
  let findManyArgs: { select?: Record<string, boolean> } | undefined
  const createdAt = new Date('2026-10-09T00:00:00.000Z')
  const prisma = {
    notification: {
      count: async () => 1,
      findMany: async (args: { select?: Record<string, boolean> }) => {
        findManyArgs = args
        return [{
          id: 'notification-1',
          type: 'SYSTEM',
          title: 'Test notification',
          body: 'Test body',
          readAt: null,
          createdAt,
        }]
      },
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
  } as unknown as PrismaClient

  const service = new PlatformApiService(prisma)
  const result = await service.listNotifications('user-1', { page: 1, pageSize: 15, unreadOnly: false })

  assert.equal(result.items.length, 1)
  assert.deepEqual(
    Object.keys(findManyArgs?.select ?? {}).sort(),
    ['body', 'createdAt', 'id', 'readAt', 'title', 'type'],
  )
  assert.equal('announcementId' in (findManyArgs?.select ?? {}), false)
})
