import { PrismaClient } from '@prisma/client'

export type { Card, Example, Prisma, PrismaClient, ReviewLog, Word } from '@prisma/client'

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl })
}
