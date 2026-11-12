import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from '../test/db.ts'

const db = testDb()

const fsrsNew = {
  due: new Date(),
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  reps: 0,
  lapses: 0,
  state: 0,
}

describe('content schema', () => {
  beforeEach(() => resetDb(db))
  afterAll(() => db.$disconnect())

  it('creates a word with only lemma and rank', async () => {
    const w = await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
    expect(w.meaningVi).toBeNull()
    expect(w.enrichedAt).toBeNull()
  })

  it('rejects duplicate lemma and duplicate tslRank', async () => {
    await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
    await expect(db.word.create({ data: { lemma: 'invoice', tslRank: 2 } })).rejects.toThrow()
    await expect(db.word.create({ data: { lemma: 'budget', tslRank: 1 } })).rejects.toThrow()
  })

  it('allows one card per (user, word, mode)', async () => {
    const user = await db.user.create({ data: { email: 'me@mail.com', passwordHash: 'x' } })
    const word = await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
    const base = { userId: user.id, wordId: word.id, ...fsrsNew }
    await db.card.create({ data: { ...base, mode: 'RECOGNIZE' } })
    await expect(db.card.create({ data: { ...base, mode: 'RECOGNIZE' } })).rejects.toThrow()
    await expect(db.card.create({ data: { ...base, mode: 'LISTEN_TYPE' } })).resolves.toBeTruthy()
  })
})
