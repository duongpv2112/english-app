import type { StudyTodayResponse } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { buildTodayQueue } from '../study/todayQueue.ts'

export async function studyRoutes(app: FastifyInstance) {
  app.get(
    '/api/study/today',
    { preHandler: app.requireAuth },
    async (request): Promise<StudyTodayResponse> =>
      buildTodayQueue(app.db, request.userId, new Date()),
  )
}
