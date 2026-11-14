import { statsOverviewSchema } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { login, sessionCookie, testApp } from '../../test/app.ts'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { seedUser } from '../seed.ts'

const db = testDb()

describe('GET /api/stats/overview', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    await resetDb(db)
    await seedUser(db, 'me@mail.com', 'secret123')
    await seedWords(db, 3)
    app = await testApp()
  })
  afterEach(() => app.close())
  afterAll(() => db.$disconnect())

  it('needs a session → 401', async () => {
    expect((await app.inject('/api/stats/overview')).statusCode).toBe(401)
  })

  it('returns the overview', async () => {
    const cookies = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
    const res = await app.inject({ url: '/api/stats/overview', cookies })
    expect(res.statusCode).toBe(200)
    const body = statsOverviewSchema.parse(res.json())
    expect(body.today).toEqual({ dueCount: 0, newCount: 3 })
    expect(body.dictationWeeks).toHaveLength(8)
  })
})
