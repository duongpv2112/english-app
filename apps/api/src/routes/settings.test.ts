import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { login, sessionCookie, testApp } from '../../test/app.ts'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { seedUser } from '../seed.ts'

const db = testDb()

describe('settings routes', () => {
  let app: FastifyInstance
  let cookies: Record<string, string>

  beforeEach(async () => {
    await resetDb(db)
    await seedUser(db, 'me@mail.com', 'secret123')
    app = await testApp()
    cookies = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
  })
  afterEach(() => app.close())
  afterAll(() => db.$disconnect())

  const patch = (payload: unknown, withCookies = true) =>
    app.inject({
      method: 'PATCH',
      url: '/api/settings',
      cookies: withCookies ? cookies : undefined,
      payload: payload as object,
    })

  it('both routes need a session → 401', async () => {
    expect((await app.inject('/api/settings')).statusCode).toBe(401)
    expect((await patch({ newPerDay: 5 }, false)).statusCode).toBe(401)
  })

  it('GET returns the defaults', async () => {
    const res = await app.inject({ url: '/api/settings', cookies })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ newPerDay: 20, timezone: 'Asia/Ho_Chi_Minh', playbackRate: 1 })
  })

  it('PATCH updates only the given fields', async () => {
    const res = await patch({ newPerDay: 15, playbackRate: 0.9 })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ newPerDay: 15, timezone: 'Asia/Ho_Chi_Minh', playbackRate: 0.9 })
    const tz = await patch({ timezone: 'America/New_York' })
    expect(tz.json()).toEqual({ newPerDay: 15, timezone: 'America/New_York', playbackRate: 0.9 })
    expect((await app.inject({ url: '/api/settings', cookies })).json().timezone).toBe(
      'America/New_York',
    )
  })

  it.each([
    { newPerDay: 101 },
    { newPerDay: 1.5 },
    { timezone: 'Mars/Base' },
    { playbackRate: 3 },
    {},
  ])('PATCH %j → 400 and nothing changes', async (bad) => {
    const res = await patch(bad)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
    expect((await app.inject({ url: '/api/settings', cookies })).json().newPerDay).toBe(20)
  })

  it('a new newPerDay is used by /study/today', async () => {
    await seedWords(db, 10)
    await patch({ newPerDay: 4 })
    const today = (await app.inject({ url: '/api/study/today', cookies })).json()
    expect(today.newCount).toBe(4)
  })
})
