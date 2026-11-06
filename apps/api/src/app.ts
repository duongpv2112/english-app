import Fastify, { type FastifyInstance } from 'fastify'
import type { Config } from './config.ts'
import { registerErrorHandling } from './plugins/errorHandler.ts'
import { healthRoutes } from './routes/health.ts'

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv === 'test' ? false : { level: 'info' },
  })

  registerErrorHandling(app)
  await app.register(healthRoutes)

  return app
}
