import { gradeDictation, type DictationAttemptInput } from '@english-app/shared'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import type { Word } from '../db.ts'
import { seedUser } from '../seed.ts'
import { applyDictationAttempts, getDictationSession } from './dictation.ts'
import { applyReviewBatch } from './reviews.ts'
import { getStudyToday } from './studyQueue.ts'

const db = testDb()
const BASE = 'https://cdn.test'
const now = new Date('2026-11-12T03:00:00.000Z')

describe('dictation', () => {
  let userId: string
  let words: Word[]

  /** Rates the recognise cards of the given words Good, which also unlocks their listen cards. */
  async function study(lemmas: string[]) {
    const { cards } = await getStudyToday(db, userId, now, null)
    const reviews = cards
      .filter((c) => lemmas.includes(c.word.lemma))
      .map((c) => ({
        id: randomUUID(),
        cardId: c.cardId,
        rating: 3 as const,
        reviewedAt: now.toISOString(),
      }))
    await applyReviewBatch(db, userId, reviews, now)
  }
  const exampleOf = async (lemma: string, start: 'First' | 'Second' = 'First') =>
    db.example.findFirstOrThrow({ where: { word: { lemma }, textEn: { startsWith: start } } })
  const attempt = (exampleId: string, input: string): DictationAttemptInput => ({
    id: randomUUID(),
    exampleId,
    input,
    createdAt: now.toISOString(),
  })
  const listenCard = (lemma: string) =>
    db.card.findFirstOrThrow({ where: { userId, mode: 'LISTEN_TYPE', word: { lemma } } })

  beforeEach(async () => {
    await resetDb(db)
    userId = (await seedUser(db, 'me@mail.com', 'secret123')).id
    words = await seedWords(db, 4)
    for (const e of await db.example.findMany()) {
      await db.example.update({ where: { id: e.id }, data: { audioKey: `audio/${e.id}.mp3` } })
    }
  })
  afterAll(() => db.$disconnect())

  describe('getDictationSession', () => {
    it('no reviewed words → empty session', async () => {
      await getStudyToday(db, userId, now, null)
      expect(await getDictationSession(db, userId, BASE)).toEqual({ items: [] })
    })

    it('no audio base URL → empty session', async () => {
      await study(['w1'])
      expect(await getDictationSession(db, userId, null)).toEqual({ items: [] })
    })

    it('offers examples only of words that have been reviewed, with audio URLs', async () => {
      await study(['w1', 'w2'])
      const { items } = await getDictationSession(db, userId, BASE)
      expect(items.map((i) => i.lemma)).toEqual(['w1', 'w1', 'w2', 'w2'])
      const first = await exampleOf('w1')
      const item = items.find((i) => i.exampleId === first.id)!
      expect(item).toEqual({
        exampleId: first.id,
        wordId: words[0]!.id,
        lemma: 'w1',
        textEn: 'First w1.',
        textVi: 'Một 1.',
        audioUrl: `${BASE}/audio/${first.id}.mp3`,
      })
    })

    it('skips examples without audio', async () => {
      await study(['w1'])
      const first = await exampleOf('w1')
      await db.example.update({ where: { id: first.id }, data: { audioKey: null } })
      const { items } = await getDictationSession(db, userId, BASE)
      expect(items.map((i) => i.textEn)).toEqual(['Second w1.'])
    })

    it('unpractised sentences come first, then lowest last score', async () => {
      await study(['w1', 'w2'])
      const a = await exampleOf('w1', 'First')
      const b = await exampleOf('w1', 'Second')
      const c = await exampleOf('w2', 'First')
      const d = await exampleOf('w2', 'Second')
      const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000)
      const store = (exampleId: string, score: number, createdAt: Date) =>
        db.dictationAttempt.create({
          data: { id: randomUUID(), userId, exampleId, input: '', score, diff: [], createdAt },
        })
      await store(a.id, 0.2, at(1))
      await store(a.id, 1.0, at(2))
      await store(b.id, 0.5, at(3))
      const { items } = await getDictationSession(db, userId, BASE)
      const unpractised = [c.id, d.id].sort()
      expect(
        items
          .slice(0, 2)
          .map((i) => i.exampleId)
          .sort(),
      ).toEqual(unpractised)
      expect(items.slice(2).map((i) => i.exampleId)).toEqual([b.id, a.id])
    })

    it('caps the session at 10 sentences', async () => {
      for (let i = 5; i <= 8; i++) {
        await db.word.create({
          data: {
            lemma: `w${i}`,
            tslRank: i,
            meaningVi: 'x',
            examples: {
              create: [
                { textEn: `First w${i}.`, textVi: 'x', audioKey: `a/${i}-1.mp3` },
                { textEn: `Second w${i}.`, textVi: 'x', audioKey: `a/${i}-2.mp3` },
              ],
            },
          },
        })
      }
      await study(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'])
      const { items } = await getDictationSession(db, userId, BASE)
      expect(items).toHaveLength(10)
      expect(items[0]!.lemma).toBe('w1')
    })
  })

  describe('applyDictationAttempts', () => {
    it('stores a graded attempt', async () => {
      const example = await exampleOf('w1')
      const sent = attempt(example.id, 'first w2')
      const res = await applyDictationAttempts(db, userId, [sent], now)
      const graded = gradeDictation('First w1.', 'first w2')
      expect(res).toEqual({
        applied: 1,
        duplicates: 0,
        rejected: [],
        results: [{ id: sent.id, ...graded }],
      })
      expect(graded.score).toBe(0.5)
      const row = await db.dictationAttempt.findUniqueOrThrow({ where: { id: sent.id } })
      expect(row).toMatchObject({ userId, exampleId: example.id, input: 'first w2', score: 0.5 })
      expect(row.diff).toEqual(graded.diff)
      expect(row.createdAt.toISOString()).toBe(now.toISOString())
    })

    it('resending the same attempt stores nothing new', async () => {
      const sent = attempt((await exampleOf('w1')).id, 'first w1')
      await applyDictationAttempts(db, userId, [sent], now)
      const res = await applyDictationAttempts(db, userId, [sent, { ...sent }], now)
      expect(res).toEqual({ applied: 0, duplicates: 2, rejected: [], results: [] })
      expect(await db.dictationAttempt.count()).toBe(1)
    })

    it('rejects an attempt for an unknown example, stores the rest', async () => {
      const bad = attempt('missing', 'x')
      const good = attempt((await exampleOf('w1')).id, 'first w1')
      const res = await applyDictationAttempts(db, userId, [bad, good], now)
      expect(res).toMatchObject({ applied: 1, rejected: [bad.id] })
      expect(await db.dictationAttempt.count()).toBe(1)
    })

    it('clamps createdAt in the future to now', async () => {
      const sent = {
        ...attempt((await exampleOf('w1')).id, 'x'),
        createdAt: '2030-01-01T00:00:00.000Z',
      }
      await applyDictationAttempts(db, userId, [sent], now)
      const row = await db.dictationAttempt.findUniqueOrThrow({ where: { id: sent.id } })
      expect(row.createdAt.toISOString()).toBe(now.toISOString())
    })

    it('missing the key word pulls the LISTEN_TYPE card forward to now, without a review log', async () => {
      await study(['w1'])
      const before = await listenCard('w1')
      expect(before.due.getTime()).toBeGreaterThan(now.getTime())
      const logs = await db.reviewLog.count()

      await applyDictationAttempts(db, userId, [attempt((await exampleOf('w1')).id, 'first')], now)

      const after = await listenCard('w1')
      expect(after.due.toISOString()).toBe(now.toISOString())
      expect([after.state, after.reps, after.stability]).toEqual([
        before.state,
        before.reps,
        before.stability,
      ])
      expect(await db.reviewLog.count()).toBe(logs)
    })

    it('getting the key word right leaves the card alone', async () => {
      await study(['w1'])
      const before = await listenCard('w1')
      await applyDictationAttempts(db, userId, [attempt((await exampleOf('w1')).id, 'w1')], now)
      expect((await listenCard('w1')).due).toEqual(before.due)
    })

    it('an overdue LISTEN_TYPE card keeps its earlier due date', async () => {
      await study(['w1'])
      const overdue = new Date('2026-11-01T00:00:00.000Z')
      await db.card.update({ where: { id: (await listenCard('w1')).id }, data: { due: overdue } })
      await applyDictationAttempts(db, userId, [attempt((await exampleOf('w1')).id, 'first')], now)
      expect((await listenCard('w1')).due).toEqual(overdue)
    })

    it('missing the key word without a LISTEN_TYPE card changes nothing', async () => {
      await getStudyToday(db, userId, now, null)
      const cards = await db.card.findMany({ orderBy: { id: 'asc' } })
      const res = await applyDictationAttempts(
        db,
        userId,
        [attempt((await exampleOf('w1')).id, 'first')],
        now,
      )
      expect(res.applied).toBe(1)
      expect(await db.card.findMany({ orderBy: { id: 'asc' } })).toEqual(cards)
    })
  })
})
