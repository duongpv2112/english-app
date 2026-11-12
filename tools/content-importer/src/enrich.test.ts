import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from '../test/db.ts'
import { enrich, type WordEnricher } from './enrich.ts'
import { enrichedWordSchema } from './enrichSchema.ts'

const db = testDb()

const good = (lemma: string) => ({
  lemma,
  pos: 'noun',
  ipa: '/x/',
  meaningVi: 'nghĩa',
  examples: [
    { textEn: 'A.', textVi: 'B.' },
    { textEn: 'C.', textVi: 'D.' },
  ],
})

/** Enricher that answers every requested lemma correctly and records the batches it got. */
function goodEnricher(calls: string[][] = []): WordEnricher {
  return async (lemmas) => {
    calls.push(lemmas)
    return { words: lemmas.map(good) }
  }
}

async function seed(...lemmas: string[]) {
  await db.word.createMany({ data: lemmas.map((lemma, i) => ({ lemma, tslRank: i + 1 })) })
}

const noSleep = async () => {}

describe('enrich', () => {
  beforeEach(() => resetDb(db))
  afterAll(() => db.$disconnect())

  it('enriches words in tslRank order, respecting limit and batch size', async () => {
    await seed('r1', 'r2', 'r3', 'r4', 'r5')
    const calls: string[][] = []
    const progress: number[][] = []
    const res = await enrich(db, goodEnricher(calls), {
      limit: 3,
      batchSize: 2,
      sleep: noSleep,
      onBatch: (done, total) => progress.push([done, total]),
    })
    expect(res).toEqual({ enriched: 3, failed: [] })
    expect(calls).toEqual([['r1', 'r2'], ['r3']])
    expect(progress).toEqual([
      [2, 3],
      [3, 3],
    ])
    const words = await db.word.findMany({
      orderBy: { tslRank: 'asc' },
      include: { examples: true },
    })
    for (const w of words.slice(0, 3)) {
      expect(w.meaningVi).toBe('nghĩa')
      expect(w.enrichedAt).not.toBeNull()
      expect(w.examples).toHaveLength(2)
    }
    expect(words.slice(3).map((w) => w.meaningVi)).toEqual([null, null])
  })

  it('matches lemmas case-insensitively and ignores extra words', async () => {
    await seed('invoice')
    const res = await enrich(db, async () => ({ words: [good('INVOICE'), good('unrequested')] }), {
      sleep: noSleep,
    })
    expect(res).toEqual({ enriched: 1, failed: [] })
    const invoice = await db.word.findUniqueOrThrow({ where: { lemma: 'invoice' } })
    expect(invoice.meaningVi).toBe('nghĩa')
    expect(await db.word.count()).toBe(1)
  })

  it('retries only missing or invalid words with 1s then 2s backoff', async () => {
    await seed('invoice', 'budget')
    const calls: string[][] = []
    const answers = [
      { words: [good('invoice')] },
      { words: [{ ...good('budget'), meaningVi: '' }] },
      { words: [good('budget')] },
    ]
    const slept: number[] = []
    const res = await enrich(
      db,
      async (lemmas) => {
        calls.push(lemmas)
        return answers[calls.length - 1]
      },
      { sleep: async (ms) => void slept.push(ms) },
    )
    expect(res).toEqual({ enriched: 2, failed: [] })
    expect(calls).toEqual([['invoice', 'budget'], ['budget'], ['budget']])
    expect(slept).toEqual([1000, 2000])
  })

  it('reports words still failing after 3 attempts and continues with the next batch', async () => {
    await seed('invoice', 'budget')
    const calls: string[][] = []
    const res = await enrich(
      db,
      async (lemmas) => {
        calls.push(lemmas)
        if (lemmas.includes('invoice')) throw new Error('boom')
        return { words: lemmas.map(good) }
      },
      { batchSize: 1, sleep: noSleep },
    )
    expect(res).toEqual({ enriched: 1, failed: [{ lemma: 'invoice', error: 'boom' }] })
    expect(calls.filter((c) => c.includes('invoice'))).toHaveLength(3)
    const budget = await db.word.findUniqueOrThrow({ where: { lemma: 'budget' } })
    expect(budget.meaningVi).toBe('nghĩa')
  })

  it('treats a response that does not match the output schema as a failed attempt', async () => {
    await seed('invoice')
    const res = await enrich(db, async () => ({ nope: true }), { sleep: noSleep })
    expect(res.enriched).toBe(0)
    expect(res.failed).toHaveLength(1)
    expect(res.failed[0]?.lemma).toBe('invoice')
  })

  it('reports a word the response never contains as missing', async () => {
    await seed('invoice')
    const res = await enrich(db, async () => ({ words: [] }), { sleep: noSleep })
    expect(res.failed).toEqual([{ lemma: 'invoice', error: 'missing from response' }])
  })

  it('never adds examples twice when run again', async () => {
    await seed('invoice', 'budget')
    await enrich(db, goodEnricher(), { sleep: noSleep })
    const second = await enrich(db, goodEnricher(), { sleep: noSleep })
    expect(second).toEqual({ enriched: 0, failed: [] })
    expect(await db.example.count()).toBe(4)
  })
})

describe('enrichedWordSchema', () => {
  it('rejects a word with zero or three examples', () => {
    const ex = { textEn: 'A.', textVi: 'B.' }
    expect(enrichedWordSchema.safeParse({ ...good('x'), examples: [] }).success).toBe(false)
    expect(enrichedWordSchema.safeParse({ ...good('x'), examples: [ex, ex, ex] }).success).toBe(
      false,
    )
    expect(enrichedWordSchema.safeParse({ ...good('x'), examples: [ex] }).success).toBe(true)
  })
})
