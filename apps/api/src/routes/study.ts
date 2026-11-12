import {
  reviewBatchRequestSchema,
  type ReviewBatchResponse,
  type StudyTodayResponse,
} from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { parse } from '../plugins/errorHandler.ts'
import { applyReviewBatch } from '../services/reviews.ts'
import { getStudyToday } from '../services/studyQueue.ts'

export async function studyRoutes(app: FastifyInstance, opts: { config: Config }) {
  app.get(
    '/api/study/today',
    { preHandler: app.requireAuth },
    async (request): Promise<StudyTodayResponse> =>
      getStudyToday(app.db, request.userId, new Date(), opts.config.audioBaseUrl),
  )

  app.post(
    '/api/reviews/batch',
    { preHandler: app.requireAuth },
    async (request): Promise<ReviewBatchResponse> => {
      const { reviews } = parse(reviewBatchRequestSchema, request.body)
      return applyReviewBatch(app.db, request.userId, reviews, new Date())
    },
  )
}
