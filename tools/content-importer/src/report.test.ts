import { resetDb, testDb } from '@english-app/api/test/db'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildReport } from './report.ts'

describe('buildReport', () => {
  const db = testDb()
  beforeEach(() => resetDb(db))
  afterAll(() => db.$disconnect())

  async function seedInvoice(meaningVi = 'hóa đơn') {
    const w = await db.word.create({
      data: { lemma: 'invoice', tslRank: 1, pos: 'noun', ipa: '/ˈɪnvɔɪs/', meaningVi },
    })
    await db.example.create({
      data: { wordId: w.id, textEn: 'Please send the invoice.', textVi: 'Vui lòng gửi hóa đơn.' },
    })
    await db.example.create({
      data: { wordId: w.id, textEn: 'The invoice is late.', textVi: 'Hóa đơn bị trễ.' },
    })
  }

  it('markdown report lists enriched words by rank', async () => {
    await seedInvoice()
    expect(await buildReport(db, { format: 'md' })).toBe(
      '## 1. invoice (noun) /ˈɪnvɔɪs/\n\nhóa đơn\n\n' +
        '- Please send the invoice. — Vui lòng gửi hóa đơn.\n' +
        '- The invoice is late. — Hóa đơn bị trễ.\n',
    )
  })

  it('csv report escapes commas and quotes', async () => {
    await seedInvoice('hóa đơn, "bill"')
    expect(await buildReport(db, { format: 'csv' })).toBe(
      'rank,lemma,pos,ipa,meaningVi,example1En,example1Vi,example2En,example2Vi\n' +
        '1,invoice,noun,/ˈɪnvɔɪs/,"hóa đơn, ""bill""",Please send the invoice.,' +
        'Vui lòng gửi hóa đơn.,The invoice is late.,Hóa đơn bị trễ.\n',
    )
  })

  it('excludes words without a meaning and respects limit', async () => {
    await seedInvoice()
    await db.word.create({ data: { lemma: 'raw', tslRank: 2 } })
    await db.word.create({
      data: { lemma: 'budget', tslRank: 3, pos: 'noun', ipa: '/ˈbʌdʒɪt/', meaningVi: 'ngân sách' },
    })
    const all = await buildReport(db, { format: 'md' })
    expect(all).toContain('## 3. budget')
    expect(all).not.toContain('raw')
    expect(await buildReport(db, { format: 'md', limit: 1 })).not.toContain('budget')
  })

  it('is empty when nothing is enriched', async () => {
    expect(await buildReport(db, { format: 'md' })).toBe('')
  })
})
