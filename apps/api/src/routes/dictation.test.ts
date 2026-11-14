import { dictationBatchResponseSchema, dictationSessionResponseSchema } from '@english-app/shared'
import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { login, sessionCookie, testApp } from '../../test/app.ts'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { seedUser } from '../seed.ts'

const db = testDb()

describe('dictation routes', () => {
  let app: FastifyInstance
  let cookies: Record<string, string>

  beforeEach(async () => {
    await resetDb(db)
    await seedUser(db, 'me@mail.com', 'secret123')
    await seedWords(db, 2)
    await db.example.updateMany({ data: { audioKey: 'audio/x.mp3' } })
    app = await testApp({ audioBaseUrl: 'https://cdn.test' })
    cookies = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
  })
  afterEach(() => app.close())
  afterAll(() => db.$disconnect())

  const post = (payload: unknown, withCookies = true) =>
    app.inject({
      method: 'POST',
      url: '/api/dictation/attempts/batch',
      cookies: withCookies ? cookies : undefined,
      payload: payload as object,
    })

  it('both routes need a session → 401', async () => {
    expect((await app.inject('/api/dictation/session')).statusCode).toBe(401)
    expect((await post({ attempts: [] }, false)).statusCode).toBe(401)
  })

  it('GET /api/dictation/session → 200 matching the schema', async () => {
    const today = (await app.inject({ url: '/api/study/today', cookies })).json()
    await app.inject({
      method: 'POST',
      url: '/api/reviews/batch',
      cookies,
      payload: {
        reviews: [
          {
            id: randomUUID(),
            cardId: today.cards[0].cardId,
            rating: 3,
            reviewedAt: new Date().toISOString(),
          },
        ],
      },
    })
    const res = await app.inject({ url: '/api/dictation/session', cookies })
    expect(res.statusCode).toBe(200)
    const body = dictationSessionResponseSchema.parse(res.json())
    expect(body.items.map((i) => i.lemma)).toEqual(['w1', 'w1'])
    expect(body.items[0]!.audioUrl).toBe('https://cdn.test/audio/x.mp3')
  })

  it('POST with an invalid body → 400 VALIDATION_ERROR', async () => {
    const res = await post({ attempts: [{ id: 'nope', exampleId: 'x', input: 'a' }] })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('POST → 200 with graded results', async () => {
    const example = await db.example.findFirstOrThrow({ where: { textEn: 'First w1.' } })
    const id = randomUUID()
    const res = await post({
      attempts: [
        { id, exampleId: example.id, input: 'first w1', createdAt: new Date().toISOString() },
      ],
    })
    expect(res.statusCode).toBe(200)
    const body = dictationBatchResponseSchema.parse(res.json())
    expect(body).toMatchObject({ applied: 1, results: [{ id, score: 1 }] })
  })
})
