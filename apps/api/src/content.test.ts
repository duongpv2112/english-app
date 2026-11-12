import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from '../test/db.ts'

const db = testDb()

describe('content models', () => {
  beforeEach(() => resetDb(db))
  afterAll(() => db.$disconnect())

  it('word starts with only lemma and rank', async () => {
    const w = await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
    expect([w.pos, w.ipa, w.meaningVi, w.audioKey]).toEqual([null, null, null, null])
  })

  it('lemma and tslRank are unique', async () => {
    await db.word.create({ data: { lemma: 'invoice', tslRank: 1 } })
    await expect(db.word.create({ data: { lemma: 'invoice', tslRank: 2 } })).rejects.toThrow()
    await expect(db.word.create({ data: { lemma: 'budget', tslRank: 1 } })).rejects.toThrow()
  })

  it('resetDb clears words and examples', async () => {
    await db.word.create({
      data: { lemma: 'invoice', tslRank: 1, examples: { create: { textEn: 'a', textVi: 'b' } } },
    })
    await resetDb(db)
    expect([await db.word.count(), await db.example.count()]).toEqual([0, 0])
  })
})
