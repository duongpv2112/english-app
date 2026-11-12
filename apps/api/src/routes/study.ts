import type { StudyTodayResponse } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { getStudyToday } from '../services/studyQueue.ts'

export async function studyRoutes(app: FastifyInstance, opts: { config: Config }) {
  app.get(
    '/api/study/today',
    { preHandler: app.requireAuth },
    async (request): Promise<StudyTodayResponse> =>
      getStudyToday(app.db, request.userId, new Date(), opts.config.audioBaseUrl),
  )
}
