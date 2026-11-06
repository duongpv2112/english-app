import secureSession from '@fastify/secure-session'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import type { Config } from '../config.ts'
import { AppError } from './errorHandler.ts'

declare module '@fastify/secure-session' {
  interface SessionData {
    userId: string
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest) => Promise<void>
  }
  interface FastifyRequest {
    userId: string
  }
}

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60

export const authPlugin = fp(async (app: FastifyInstance, opts: { config: Config }) => {
  await app.register(secureSession, {
    key: opts.config.sessionSecret,
    cookieName: 'session',
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.config.nodeEnv === 'production',
      maxAge: THIRTY_DAYS_SECONDS,
    },
  })

  app.decorateRequest('userId', '')

  // preHandler for routes that need a logged-in user; also checks the user still exists.
  app.decorate('requireAuth', async (request: FastifyRequest) => {
    const userId = request.session.get('userId')
    const user = userId
      ? await app.db.user.findUnique({ where: { id: userId }, select: { id: true } })
      : null
    if (!user) throw new AppError('UNAUTHENTICATED', 401, 'Not logged in')
    request.userId = user.id
  })
})
