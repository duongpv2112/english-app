import { loginRequestSchema, type MeResponse } from '@english-app/shared'
import argon2 from 'argon2'
import type { FastifyInstance } from 'fastify'
import { AppError, parse } from '../plugins/errorHandler.ts'

const INVALID = () => new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password')

export async function authRoutes(app: FastifyInstance) {
  // Verified against when the email is unknown, so both failures take about the same time.
  const dummyHash = await argon2.hash('not-a-real-password')

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: '1 minute',
          errorResponseBuilder: () => ({
            statusCode: 429,
            message: 'Too many login attempts, try again in 1 minute',
          }),
        },
      },
    },
    async (request): Promise<MeResponse> => {
      const { email, password } = parse(loginRequestSchema, request.body)
      const user = await app.db.user.findUnique({ where: { email } })
      const ok = await argon2.verify(user?.passwordHash ?? dummyHash, password)
      if (!user || !ok) throw INVALID()
      request.session.set('userId', user.id)
      return { id: user.id, email: user.email }
    },
  )

  app.post('/api/auth/logout', async (request, reply) => {
    request.session.delete()
    return reply.status(204).send()
  })

  app.get('/api/auth/me', { preHandler: app.requireAuth }, async (request): Promise<MeResponse> => {
    const user = await app.db.user.findUniqueOrThrow({ where: { id: request.userId } })
    return { id: user.id, email: user.email }
  })
}
