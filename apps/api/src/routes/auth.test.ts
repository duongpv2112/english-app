import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { login, sessionCookie, testApp } from '../../test/app.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { seedUser } from '../seed.ts'

const db = testDb()

describe('auth routes', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    await resetDb(db)
    await seedUser(db, 'me@mail.com', 'secret123')
    app = await testApp()
  })
  afterEach(() => app.close())
  afterAll(() => db.$disconnect())

  it('login ok → 200 + session cookie', async () => {
    const res = await login(app, 'me@mail.com', 'secret123')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ id: expect.any(String), email: 'me@mail.com' })
    expect(res.cookies.find((c) => c.name === 'session')?.httpOnly).toBe(true)
  })

  it('login with messy email casing → 200', async () => {
    expect((await login(app, '  ME@Mail.com ', 'secret123')).statusCode).toBe(200)
  })

  it('wrong password and unknown email → same 401 INVALID_CREDENTIALS', async () => {
    const a = await login(app, 'me@mail.com', 'nope')
    const b = await login(app, 'x@mail.com', 'secret123')
    expect([a.statusCode, b.statusCode]).toEqual([401, 401])
    expect(a.json()).toEqual(b.json())
    expect(a.json().error.code).toBe('INVALID_CREDENTIALS')
  })

  it('invalid body → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'me@mail.com' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('non-JSON body → 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{bad',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('me without cookie → 401 UNAUTHENTICATED', async () => {
    const res = await app.inject('/api/auth/me')
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('UNAUTHENTICATED')
  })

  it('me with tampered cookie → 401', async () => {
    const res = await app.inject({ url: '/api/auth/me', cookies: { session: 'garbage' } })
    expect(res.statusCode).toBe(401)
  })

  it('me with session → 200; after logout → 401', async () => {
    const cookie = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
    const me = await app.inject({ url: '/api/auth/me', cookies: cookie })
    expect(me.statusCode).toBe(200)
    expect(me.json().email).toBe('me@mail.com')

    const out = await app.inject({ method: 'POST', url: '/api/auth/logout', cookies: cookie })
    expect(out.statusCode).toBe(204)
    const after = await app.inject({ url: '/api/auth/me', cookies: sessionCookie(out) })
    expect(after.statusCode).toBe(401)
  })

  it('me after the user was deleted → 401', async () => {
    const cookie = sessionCookie(await login(app, 'me@mail.com', 'secret123'))
    await resetDb(db)
    expect((await app.inject({ url: '/api/auth/me', cookies: cookie })).statusCode).toBe(401)
  })

  it('6th login attempt within a minute → 429 RATE_LIMITED', async () => {
    for (let i = 0; i < 5; i++) await login(app, 'me@mail.com', 'nope')
    const res = await login(app, 'me@mail.com', 'nope')
    expect(res.statusCode).toBe(429)
    expect(res.json().error.code).toBe('RATE_LIMITED')
  })

  it('cookie is not secure outside production', async () => {
    const cookie = (await login(app, 'me@mail.com', 'secret123')).cookies.find(
      (c) => c.name === 'session',
    )
    expect(cookie).toBeDefined()
    expect(cookie?.secure).toBeFalsy()
  })

  it('cookie is secure in production', async () => {
    const prod = await testApp({ nodeEnv: 'production' })
    const res = await login(prod, 'me@mail.com', 'secret123')
    expect(res.cookies.find((c) => c.name === 'session')?.secure).toBe(true)
    await prod.close()
  })
})
