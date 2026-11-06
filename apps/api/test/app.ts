import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { inject } from 'vitest'
import { buildApp } from '../src/app.ts'
import { loadConfig, type Config } from '../src/config.ts'

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    ...loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: inject('databaseUrl'),
      SESSION_SECRET: 'a'.repeat(64),
    }),
    ...overrides,
  }
}

export async function testApp(overrides: Partial<Config> = {}): Promise<FastifyInstance> {
  const app = await buildApp(testConfig(overrides))
  await app.ready()
  return app
}

export function login(app: FastifyInstance, email: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } })
}

/** The session cookie a response set, in the shape `inject({ cookies })` expects. */
export function sessionCookie(res: LightMyRequestResponse): Record<string, string> {
  const c = res.cookies.find((c) => c.name === 'session')
  return c ? { session: c.value } : {}
}
