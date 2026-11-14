import { wordPatchSchema, type StudyWord } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import type { Config } from '../config.ts'
import { parse } from '../plugins/errorHandler.ts'
import { updateWord } from '../services/words.ts'

export async function wordRoutes(app: FastifyInstance, opts: { config: Config }) {
  app.patch<{ Params: { id: string } }>(
    '/api/words/:id',
    { preHandler: app.requireAuth },
    async (request): Promise<StudyWord> =>
      updateWord(
        app.db,
        request.params.id,
        parse(wordPatchSchema, request.body),
        opts.config.audioBaseUrl,
      ),
  )
}
