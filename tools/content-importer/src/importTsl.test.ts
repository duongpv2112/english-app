import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from '../test/db.ts'
import { importTsl, parseTslCsv } from './importTsl.ts'

describe('parseTslCsv', () => {
  it('uses row order as rank when there is no rank column', () => {
    expect(parseTslCsv('Word\ninvoice\nbudget\n')).toEqual([
      { lemma: 'invoice', rank: 1 },
      { lemma: 'budget', rank: 2 },
    ])
  })

  it('handles BOM, CRLF, blank lines, case and spaces', () => {
    expect(parseTslCsv('﻿Word\r\n Invoice \r\n\r\nBUDGET\r\n')).toEqual([
      { lemma: 'invoice', rank: 1 },
      { lemma: 'budget', rank: 2 },
    ])
  })

  it('reads the rank column when present', () => {
    expect(parseTslCsv('lemma,rank\ninvoice,7\n')).toEqual([{ lemma: 'invoice', rank: 7 }])
  })

  it('throws on a non-numeric rank', () => {
    expect(() => parseTslCsv('lemma,rank\ninvoice,abc\n')).toThrow(/invalid rank.*invoice/i)
  })

  it('keeps the first of duplicate lemmas', () => {
    expect(parseTslCsv('word\ninvoice\nInvoice\n')).toEqual([{ lemma: 'invoice', rank: 1 }])
  })

  it('throws when there is no word or lemma column', () => {
    expect(() => parseTslCsv('foo\nbar\n')).toThrow(/word.*lemma|lemma.*word/i)
  })
})

describe('importTsl', () => {
  const db = testDb()
  beforeEach(() => resetDb(db))
  afterAll(() => db.$disconnect())

  it('inserts new words and skips them on a second run', async () => {
    const rows = [
      { lemma: 'invoice', rank: 1 },
      { lemma: 'budget', rank: 2 },
    ]
    expect(await importTsl(db, rows)).toEqual({ inserted: 2, skipped: 0 })
    expect(await importTsl(db, rows)).toEqual({ inserted: 0, skipped: 2 })
    expect(await db.word.count()).toBe(2)
  })
})
