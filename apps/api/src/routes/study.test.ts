import { reviewBatchResponseSchema, studyTodayResponseSchema } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
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

  const review = (cardId: string) => ({
    id: randomUUID(),
    cardId,
    rating: 4,
    reviewedAt: new Date().toISOString(),
  })

  it('POST /api/reviews/batch without session → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reviews/batch',
      payload: { reviews: [review('x')] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/reviews/batch with an invalid body → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/reviews/batch',
      cookies,
      payload: { reviews: [{ ...review('x'), rating: 9 }] },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/reviews/batch → 200, and the card leaves the new list of /study/today', async () => {
    const today = (await app.inject({ url: '/api/study/today', cookies })).json()
    const res = await app.inject({
      method: 'POST',
      url: '/api/reviews/batch',
      cookies,
      payload: { reviews: [review(today.cards[0].cardId)] },
    })
    expect(res.statusCode).toBe(200)
    const body = reviewBatchResponseSchema.parse(res.json())
    expect(body).toMatchObject({ applied: 1, duplicates: 0, rejected: [] })
    const after = (await app.inject({ url: '/api/study/today', cookies })).json()
    expect(after.cards.map((c: { word: { lemma: string } }) => c.word.lemma)).toEqual(['w2', 'w3'])
  })
})
