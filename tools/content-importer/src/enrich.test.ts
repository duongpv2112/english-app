import { resetDb, testDb } from '@english-app/api/test/db'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { enrichWords, type Enricher, type WordEnrichment } from './enrich.ts'
import { importTsl } from './tsl.ts'

function fake(lemmas: string[]): WordEnrichment[] {
  return lemmas.map((lemma) => ({
    lemma,
    pos: 'noun',
    ipa: `/${lemma}/`,
    meaningVi: `nghĩa ${lemma}`,
    examples: [
      { textEn: `One ${lemma}.`, textVi: `Một ${lemma}.` },
      { textEn: `Two ${lemma}.`, textVi: `Hai ${lemma}.` },
    ],
  }))
}

describe('enrichWords', () => {
  const db = testDb()
  const dir = mkdtempSync(join(tmpdir(), 'enrich-'))
  const failedPath = join(dir, 'failed.json')
  let sleeps: number[]
  const opts = () => ({ failedPath, sleep: async (ms: number) => void sleeps.push(ms) })

  beforeEach(async () => {
    await resetDb(db)
    rmSync(failedPath, { force: true })
    sleeps = []
  })
  afterAll(async () => {
    await db.$disconnect()
    rmSync(dir, { recursive: true, force: true })
  })

  it('enriches pending words in rank order, in batches', async () => {
    await importTsl(db, ['a1', 'a2', 'a3'])
    const calls: string[][] = []
    const enricher: Enricher = async (l) => {
      calls.push(l)
      return fake(l)
    }
    const res = await enrichWords(db, enricher, { ...opts(), batchSize: 2 })
    expect(res).toEqual({ enriched: 3, failed: 0 })
    expect(calls).toEqual([['a1', 'a2'], ['a3']])
    const w = await db.word.findUniqueOrThrow({
      where: { lemma: 'a1' },
      include: { examples: true },
    })
    expect([w.pos, w.ipa, w.meaningVi]).toEqual(['noun', '/a1/', 'nghĩa a1'])
    expect(w.examples.map((e) => e.textEn).sort()).toEqual(['One a1.', 'Two a1.'])
  })

  it('skips words that already have a meaning and respects limit', async () => {
    await importTsl(db, ['a1', 'a2', 'a3'])
    await db.word.update({ where: { lemma: 'a1' }, data: { meaningVi: 'có rồi' } })
    const calls: string[][] = []
    const res = await enrichWords(
      db,
      async (l) => {
        calls.push(l)
        return fake(l)
      },
      { ...opts(), limit: 1 },
    )
    expect(res).toEqual({ enriched: 1, failed: 0 })
    expect(calls).toEqual([['a2']])
  })

  it('retries with backoff, then succeeds', async () => {
    await importTsl(db, ['a1'])
    let n = 0
    const res = await enrichWords(
      db,
      async (l) => {
        if (++n < 3) throw new Error('boom')
        return fake(l)
      },
      opts(),
    )
    expect(res).toEqual({ enriched: 1, failed: 0 })
    expect(sleeps).toEqual([1000, 2000])
    expect(existsSync(failedPath)).toBe(false)
  })

  it('after 3 failed attempts writes failed.json and continues with next batch', async () => {
    await importTsl(db, ['a1', 'a2'])
    let a1Calls = 0
    const res = await enrichWords(
      db,
      async (l) => {
        if (l[0] === 'a1') {
          a1Calls++
          throw new Error('boom')
        }
        return fake(l)
      },
      { ...opts(), batchSize: 1 },
    )
    expect(res).toEqual({ enriched: 1, failed: 1 })
    expect(a1Calls).toBe(3)
    expect(JSON.parse(readFileSync(failedPath, 'utf8'))).toEqual([{ lemma: 'a1', error: 'boom' }])
    expect((await db.word.findUniqueOrThrow({ where: { lemma: 'a1' } })).meaningVi).toBeNull()
    expect((await db.word.findUniqueOrThrow({ where: { lemma: 'a2' } })).meaningVi).toBe('nghĩa a2')
  })

  const badResponses: [string, (l: string[]) => unknown[]][] = [
    ['missing word', (l) => fake(l).slice(1)],
    ['extra word', (l) => [...fake(l), ...fake(['zzz'])]],
    ['duplicated word', (l) => [fake(l)[0], fake(l)[0]]],
    ['one example only', (l) => fake(l).map((w) => ({ ...w, examples: w.examples.slice(1) }))],
    ['empty meaning', (l) => fake(l).map((w) => ({ ...w, meaningVi: '' }))],
  ]
  it.each(badResponses)('rejects a batch with %s and writes nothing', async (_name, bad) => {
    await importTsl(db, ['a1', 'a2'])
    const res = await enrichWords(db, (async (l: string[]) => bad(l)) as Enricher, opts())
    expect(res).toEqual({ enriched: 0, failed: 2 })
    expect(await db.example.count()).toBe(0)
    expect(await db.word.count({ where: { meaningVi: null } })).toBe(2)
    expect(
      JSON.parse(readFileSync(failedPath, 'utf8')).map((f: { lemma: string }) => f.lemma),
    ).toEqual(['a1', 'a2'])
  })

  it('rerun after a failed batch does not duplicate examples', async () => {
    await importTsl(db, ['a1', 'a2'])
    await enrichWords(
      db,
      async () => {
        throw new Error('boom')
      },
      opts(),
    )
    expect(await enrichWords(db, async (l) => fake(l), opts())).toEqual({ enriched: 2, failed: 0 })
    expect(await enrichWords(db, async (l) => fake(l), opts())).toEqual({ enriched: 0, failed: 0 })
    expect(await db.example.count()).toBe(4)
  })

  it('matches lemmas case-insensitively', async () => {
    await importTsl(db, ['a1'])
    const res = await enrichWords(
      db,
      async (l) => fake(l).map((w) => ({ ...w, lemma: w.lemma.toUpperCase() })),
      opts(),
    )
    expect(res).toEqual({ enriched: 1, failed: 0 })
  })

  it('removes a stale failed.json when everything succeeds', async () => {
    writeFileSync(failedPath, '[]')
    await importTsl(db, ['a1'])
    await enrichWords(db, async (l) => fake(l), opts())
    expect(existsSync(failedPath)).toBe(false)
  })
})
