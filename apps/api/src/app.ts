import type { PrismaClient } from '@prisma/client'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Config } from './config.ts'
import { createPrisma } from './db.ts'
import { registerErrorHandling } from './plugins/errorHandler.ts'
import { healthRoutes } from './routes/health.ts'

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient
  }
}

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : { level: 'info' },
  })

  // Prisma connects lazily, on the first query.
  app.decorate('db', createPrisma(config.databaseUrl))
  app.addHook('onClose', async () => app.db.$disconnect())

  registerErrorHandling(app)
  await app.register(healthRoutes)

  return app
}
