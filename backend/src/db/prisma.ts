import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { PrismaClient } from '../generated/prisma/client.js'
import { env } from '../config/env.js'

const adapter = new PrismaMariaDb({
  host: env.database.host,
  port: env.database.port,
  user: env.database.user,
  password: env.database.password,
  database: env.database.name,
  connectionLimit: env.databaseConnectionLimit,
})

export const prisma = new PrismaClient({ adapter })

export async function connectDatabase(): Promise<void> {
  await prisma.$connect()
  await prisma.$queryRaw`SELECT 1`
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch {
    return false
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}
