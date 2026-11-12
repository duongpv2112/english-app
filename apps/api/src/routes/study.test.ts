import { studyTodayResponseSchema } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { login, sessionCookie, testApp } from '../../test/app.ts'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { seedUser } from '../seed.ts'

const db = testDb()

describe('study routes', () => {
  let app: FastifyInstance
  let cookies: Record<string, string>

  beforeEach(async () => {
    await resetDb(db)
    await seedUser(db, 'me@mail.com', 'secret123')
    await seedWords(db, 3)
    app = await testApp()
    cookies = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
  })
  afterEach(() => app.close())
  afterAll(() => db.$disconnect())

  it('GET /api/study/today without session → 401 UNAUTHENTICATED', async () => {
    const res = await app.inject('/api/study/today')
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('GET /api/study/today → 200 matching studyTodayResponseSchema', async () => {
    const res = await app.inject({ url: '/api/study/today', cookies })
    expect(res.statusCode).toBe(200)
    const body = studyTodayResponseSchema.parse(res.json())
    expect(body.cards.map((c) => c.word.lemma)).toEqual(['w1', 'w2', 'w3'])
  })
})
