import {
  dictationBatchRequestSchema,
  type DictationBatchResponse,
  type DictationSessionResponse,
} from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { parse } from '../plugins/errorHandler.ts'
import { applyDictationAttempts, getDictationSession } from '../services/dictation.ts'

export async function dictationRoutes(app: FastifyInstance, opts: { config: Config }) {
  app.get(
    '/api/dictation/session',
    { preHandler: app.requireAuth },
    async (request): Promise<DictationSessionResponse> =>
      getDictationSession(app.db, request.userId, opts.config.audioBaseUrl),
  )

  app.post(
    '/api/dictation/attempts/batch',
    { preHandler: app.requireAuth },
    async (request): Promise<DictationBatchResponse> => {
      const { attempts } = parse(dictationBatchRequestSchema, request.body)
      return applyDictationAttempts(app.db, request.userId, attempts, new Date())
    },
  )
}
