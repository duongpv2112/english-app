import argon2 from 'argon2'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from '../test/db.ts'
import { seedUser } from './seed.ts'

const db = testDb()

describe('seedUser', () => {
  beforeEach(() => resetDb(db))
  afterAll(() => db.$disconnect())

  it('creates user with normalized email and argon2 hash', async () => {
    const u = await seedUser(db, '  Me@Mail.com ', 'secret123')
    expect(u.email).toBe('me@mail.com')
    expect(u.passwordHash).toMatch(/^\$argon2/)
    expect(await argon2.verify(u.passwordHash, 'secret123')).toBe(true)
  })

  it('is idempotent and updates password', async () => {
    await seedUser(db, 'me@mail.com', 'a')
    await seedUser(db, 'me@mail.com', 'b')
    expect(await db.user.count()).toBe(1)
    const u = await db.user.findUniqueOrThrow({ where: { email: 'me@mail.com' } })
    expect(await argon2.verify(u.passwordHash, 'b')).toBe(true)
  })
})
