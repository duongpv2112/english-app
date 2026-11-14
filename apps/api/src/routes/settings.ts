import { settingsPatchSchema, type Settings } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { parse } from '../plugins/errorHandler.ts'

const fields = { newPerDay: true, timezone: true, playbackRate: true } as const

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', { preHandler: app.requireAuth }, async (request): Promise<Settings> =>
    app.db.user.findUniqueOrThrow({ where: { id: request.userId }, select: fields }),
  )

  app.patch(
    '/api/settings',
    { preHandler: app.requireAuth },
    async (request): Promise<Settings> => {
      const patch = parse(settingsPatchSchema, request.body)
      return app.db.user.update({ where: { id: request.userId }, data: patch, select: fields })
    },
  )
}
