import { inject } from 'vitest'
import { createPrisma, type PrismaClient } from '../src/db.ts'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

export function testDb(): PrismaClient {
  return createPrisma(inject('databaseUrl'))
}

export async function resetDb(db: PrismaClient) {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "ReviewLog", "Card", "Example", "Word", "User" CASCADE',
  )
}
