import type { StatsOverview } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { getStatsOverview } from '../services/stats.ts'

export async function statsRoutes(app: FastifyInstance) {
  app.get(
    '/api/stats/overview',
    { preHandler: app.requireAuth },
    async (request): Promise<StatsOverview> => getStatsOverview(app.db, request.userId, new Date()),
  )
}
