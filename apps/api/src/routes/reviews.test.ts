import { studyTodayResponseSchema } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { testApp } from '../../test/app.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { loggedInUser, seedWords } from '../../test/fixtures.ts'

const db = testDb()

describe('POST /api/reviews/batch', () => {
  let app: FastifyInstance
  beforeEach(async () => {
    await resetDb(db)
    app = await testApp()
  })
  afterEach(() => app.close())
  afterAll(() => db.$disconnect())

  const post = (payload: object, cookies?: Record<string, string>) =>
    app.inject({ method: 'POST', url: '/api/reviews/batch', payload, cookies })

  it('requires login', async () => {
    expect((await post({ reviews: [] })).statusCode).toBe(401)
  })

  it('rejects an invalid body with VALIDATION_ERROR', async () => {
    const { cookies } = await loggedInUser(app, db)
    const ok = {
      id: crypto.randomUUID(),
      cardId: 'c',
      rating: 3,
      reviewedAt: new Date().toISOString(),
    }
    for (const body of [
      { reviews: [] },
      { reviews: [{ ...ok, rating: 5 }] },
      { reviews: [{ ...ok, id: 'not-a-uuid' }] },
    ]) {
      const res = await post(body, cookies)
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION_ERROR')
    }
  })

  it('accepts a batch and the card leaves today queue when due tomorrow', async () => {
    await seedWords(db, 2)
    const { cookies } = await loggedInUser(app, db)
    const today = async () =>
      studyTodayResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/study/today', cookies })).json(),
      )
    const first = (await today()).cards[0]!
    const res = await post(
      {
        reviews: [
          {
            id: crypto.randomUUID(),
            cardId: first.cardId,
            rating: 4,
            reviewedAt: new Date().toISOString(),
          },
        ],
      },
      cookies,
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ accepted: 1, duplicates: 0 })
    expect((await today()).cards.map((c) => c.cardId)).not.toContain(first.cardId)
  })
})
