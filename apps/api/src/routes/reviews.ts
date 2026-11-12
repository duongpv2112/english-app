import { reviewBatchRequestSchema, type ReviewBatchResponse } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { parse } from '../plugins/errorHandler.ts'
import { applyReviews } from '../study/applyReviews.ts'

export async function reviewRoutes(app: FastifyInstance) {
  app.post(
    '/api/reviews/batch',
    { preHandler: app.requireAuth },
    async (request): Promise<ReviewBatchResponse> => {
      const { reviews } = parse(reviewBatchRequestSchema, request.body)
      return applyReviews(app.db, request.userId, reviews, new Date())
    },
  )
}
