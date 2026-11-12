import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from '../test/db.ts'
import { buildReport } from './report.ts'

const db = testDb()

async function word(lemma: string, tslRank: number, enrichedAt: Date | null, meaningVi = 'nghĩa') {
  await db.word.create({
    data: {
      lemma,
      tslRank,
      ...(enrichedAt && {
        pos: 'noun',
        ipa: '/x/',
        meaningVi,
        enrichedAt,
        examples: { create: [{ textEn: `The ${lemma}.`, textVi: 'Câu.' }] },
      }),
    },
  })
}

describe('buildReport', () => {
  beforeEach(() => resetDb(db))
  afterAll(() => db.$disconnect())

  it('lists only enriched words in rank order with escaped pipes', async () => {
    await word('budget', 2, new Date())
    await word('invoice', 1, new Date(), 'hóa đơn | phiếu\nthu')
    await word('deadline', 3, null)
    const md = await buildReport(db, {})
    expect(md).toContain('# Content report')
    expect(md).toContain('2 words')
    expect(md.indexOf('invoice')).toBeLessThan(md.indexOf('budget'))
    expect(md).toContain('hóa đơn \\| phiếu thu')
    expect(md).toContain('The invoice. — Câu.')
    expect(md).not.toContain('deadline')
  })

  it('filters by since', async () => {
    await word('budget', 1, new Date('2026-11-01T10:00:00Z'))
    await word('invoice', 2, new Date('2026-11-12T10:00:00Z'))
    const md = await buildReport(db, { since: new Date('2026-11-12T00:00:00Z') })
    expect(md).toContain('1 words')
    expect(md).toContain('invoice')
    expect(md).not.toContain('budget')
  })
})
