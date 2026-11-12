import { PrismaClient } from '@prisma/client'

export type { Example, Prisma, PrismaClient, Word } from '@prisma/client'

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl })
}
