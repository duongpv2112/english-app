import { PrismaClient } from '@prisma/client'
import { inject } from 'vitest'
import { createPrisma } from '../src/db.ts'

export function testDb(): PrismaClient {
  return createPrisma(inject('databaseUrl'))
}

export async function resetDb(db: PrismaClient) {
  await db.$executeRawUnsafe('TRUNCATE TABLE "User", "Word" CASCADE')
}
