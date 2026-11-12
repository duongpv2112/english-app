import { newCardState } from '@english-app/shared'
import type { User } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from '../../test/db.ts'
import { seedTestUser, seedWords } from '../../test/fixtures.ts'
import { stateToCardData } from './cardState.ts'
import { buildTodayQueue } from './todayQueue.ts'

const db = testDb()
// 10:00 in Vietnam.
const now = new Date('2026-11-12T03:00:00Z')

describe('buildTodayQueue', () => {
  let user: User
  beforeEach(async () => {
    await resetDb(db)
    user = await seedTestUser(db)
  })
  afterAll(() => db.$disconnect())

  async function reviewedCard(
    lemma: string,
    due: Date,
    mode: 'RECOGNIZE' | 'LISTEN_TYPE' = 'RECOGNIZE',
  ) {
    const word = await db.word.findUniqueOrThrow({ where: { lemma } })
    return db.card.create({
      data: {
        userId: user.id,
        wordId: word.id,
        mode,
        ...stateToCardData({ ...newCardState(now), reps: 1, state: 2, due, lastReview: now }),
      },
    })
  }

  it('returns new enriched words in tslRank order, up to newPerDay', async () => {
    await seedWords(db, 25)
    const q = await buildTodayQueue(db, user.id, now)
    expect(q.cards).toHaveLength(20)
    expect(q.cards.map((c) => c.word.lemma)).toEqual(
      Array.from({ length: 20 }, (_, i) => `w${i + 1}`),
    )
    expect(q.cards.every((c) => c.isNew)).toBe(true)
    expect(q.newCount).toBe(20)
    expect(q.dueCount).toBe(0)
    expect(q.cards[0]?.word.examples).toHaveLength(2)
    expect(q.dayEnd).toBe('2026-11-12T17:00:00.000Z')
  })

  it('skips words without content and returns fewer when not enough', async () => {
    await seedWords(db, 3)
    await seedWords(db, 2, { enriched: false, fromRank: 4 })
    const q = await buildTodayQueue(db, user.id, now)
    expect(q.cards.map((c) => c.word.lemma)).toEqual(['w1', 'w2', 'w3'])
    expect(q.newCount).toBe(3)
  })

  it('reuses unreviewed cards instead of creating new ones', async () => {
    await seedWords(db, 25)
    const a = await buildTodayQueue(db, user.id, now)
    const b = await buildTodayQueue(db, user.id, now)
    expect(await db.card.count()).toBe(20)
    expect(b.cards.map((c) => c.cardId)).toEqual(a.cards.map((c) => c.cardId))
  })

  it('puts due cards first, ordered by due, and excludes cards due after today', async () => {
    await seedWords(db, 5)
    await reviewedCard('w3', new Date('2026-11-12T02:00:00Z'))
    await reviewedCard('w4', new Date('2026-11-11T02:00:00Z'))
    await reviewedCard('w5', new Date('2026-11-13T02:00:00Z'))
    const q = await buildTodayQueue(db, user.id, now)
    expect(q.cards.map((c) => [c.word.lemma, c.isNew])).toEqual([
      ['w4', false],
      ['w3', false],
      ['w1', true],
      ['w2', true],
    ])
    expect(q.dueCount).toBe(2)
  })

  it('counts new words already introduced today against newPerDay, by local day', async () => {
    await seedWords(db, 30)
    // 5 words first reviewed at 23:50 Vietnam time on Nov 12.
    const first = await buildTodayQueue(db, user.id, new Date('2026-11-12T16:40:00Z'))
    for (const c of first.cards.slice(0, 5)) {
      await db.reviewLog.create({
        data: {
          id: crypto.randomUUID(),
          cardId: c.cardId,
          rating: 3,
          reviewedAt: new Date('2026-11-12T16:50:00Z'),
        },
      })
      await db.card.update({
        where: { id: c.cardId },
        data: { reps: 1, due: new Date('2026-11-20T00:00:00Z') },
      })
    }
    expect((await buildTodayQueue(db, user.id, new Date('2026-11-12T16:55:00Z'))).newCount).toBe(15)
    expect((await buildTodayQueue(db, user.id, new Date('2026-11-12T17:10:00Z'))).newCount).toBe(20)
  })

  it('only returns RECOGNIZE cards', async () => {
    await seedWords(db, 1)
    await reviewedCard('w1', new Date('2026-11-11T00:00:00Z'), 'LISTEN_TYPE')
    const q = await buildTodayQueue(db, user.id, now)
    expect(q.cards.map((c) => c.isNew)).toEqual([true])
    expect(q.dueCount).toBe(0)
  })
})
