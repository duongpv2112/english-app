import { resetDb, testDb } from '@english-app/api/test/db'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { importTsl, parseTslCsv } from './tsl.ts'

describe('parseTslCsv', () => {
  it('parses a messy CSV', () => {
    const csv = '\uFEFFHeadword,Rank\r\nInvoice,1\r\n\r\n"budget",2\r\n invoice ,3\r\ndeadline\r\n'
    expect(parseTslCsv(csv)).toEqual(['invoice', 'budget', 'deadline'])
  })

  it('keeps the first row when it is not a header', () => {
    expect(parseTslCsv('invoice\nbudget')).toEqual(['invoice', 'budget'])
  })
})

describe('importTsl', () => {
  const db = testDb()
  beforeEach(() => resetDb(db))
  afterAll(() => db.$disconnect())

  it('imports words with rank by position', async () => {
    expect(await importTsl(db, ['invoice', 'budget'])).toEqual({ created: 2, skipped: 0 })
    const words = await db.word.findMany({ orderBy: { tslRank: 'asc' } })
    expect(words.map((w) => [w.lemma, w.tslRank])).toEqual([
      ['invoice', 1],
      ['budget', 2],
    ])
  })

  it('skips existing words on rerun and keeps their content', async () => {
    await importTsl(db, ['invoice', 'budget'])
    await db.word.update({ where: { lemma: 'invoice' }, data: { meaningVi: 'hóa đơn' } })
    expect(await importTsl(db, ['invoice', 'budget', 'deadline'])).toEqual({
      created: 1,
      skipped: 2,
    })
    expect((await db.word.findUniqueOrThrow({ where: { lemma: 'invoice' } })).meaningVi).toBe(
      'hóa đơn',
    )
  })
})
