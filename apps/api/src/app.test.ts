import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused',
  SESSION_SECRET: 'a'.repeat(64),
})

describe('app', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp(config)
    app.get('/api/__boom', async () => {
      throw new Error('boom')
    })
    await app.ready()
  })

  afterAll(() => app.close())

  it('GET /api/health → 200 ok', async () => {
    const res = await app.inject('/api/health')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })

  it('unknown /api route → 404 NOT_FOUND shape', async () => {
    const res = await app.inject('/api/nope')
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } })
  })

  it('thrown generic error → 500 INTERNAL_ERROR without stack', async () => {
    const res = await app.inject('/api/__boom')
    expect(res.statusCode).toBe(500)
    expect(res.json().error.code).toBe('INTERNAL_ERROR')
    expect(res.body).not.toContain('boom')
  })
})
