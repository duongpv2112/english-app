import { studyTodayResponseSchema } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { testApp } from '../../test/app.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { loggedInUser, seedWords } from '../../test/fixtures.ts'

const db = testDb()

describe('GET /api/study/today', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    await resetDb(db)
    app = await testApp()
  })
  afterEach(() => app.close())
  afterAll(() => db.$disconnect())

  it('requires login', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/study/today' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('returns a queue that matches the response schema', async () => {
    await seedWords(db, 2)
    const { cookies } = await loggedInUser(app, db)
    const res = await app.inject({ method: 'GET', url: '/api/study/today', cookies })
    expect(res.statusCode).toBe(200)
    expect(studyTodayResponseSchema.parse(res.json()).cards).toHaveLength(2)
  })
})
