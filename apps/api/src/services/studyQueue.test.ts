import { applyRating, newCardState, type CardState } from '@english-app/shared'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import type { PrismaClient } from '../db.ts'
import { seedUser } from '../seed.ts'
import { stateToCardData } from './cardState.ts'
import { getStudyToday } from './studyQueue.ts'

const db = testDb()
// 10:00 in Ho Chi Minh; the local day runs 2026-11-11T17:00Z → 2026-11-12T17:00Z.
const now = new Date('2026-11-12T03:00:00.000Z')

/** Records a review directly in the database, the way the review endpoint will. */
async function review(db: PrismaClient, cardId: string, state: CardState, at: Date) {
  const next = applyRating(state, 3, at)
  await db.reviewLog.create({ data: { id: randomUUID(), cardId, rating: 3, reviewedAt: at } })
  await db.card.update({ where: { id: cardId }, data: stateToCardData(next) })
  return next
}

describe('getStudyToday', () => {
  let userId: string

  beforeEach(async () => {
    await resetDb(db)
    userId = (await seedUser(db, 'me@mail.com', 'secret123')).id
  })
  afterAll(() => db.$disconnect())

  it('empty database → empty queue', async () => {
    expect(await getStudyToday(db, userId, now, null)).toEqual({
      cards: [],
      dueCount: 0,
      newCount: 0,
      dayEndsAt: '2026-11-12T17:00:00.000Z',
    })
  })

  it('introduces new words by rank up to newPerDay and creates their cards', async () => {
    await seedWords(db, 25)
    const res = await getStudyToday(db, userId, now, null)
    expect(res.cards.map((c) => c.word.lemma)).toEqual(
      Array.from({ length: 20 }, (_, i) => `w${i + 1}`),
    )
    expect(res).toMatchObject({ dueCount: 0, newCount: 20 })
    expect(res.cards[0]).toMatchObject({
      mode: 'RECOGNIZE',
      isNew: true,
      state: newCardState(now),
      word: { lemma: 'w1', pos: 'noun', ipa: '/w1/', meaningVi: 'nghĩa 1', audioUrl: null },
    })
    expect(res.cards[0]!.word.examples.map((e) => e.textEn).sort()).toEqual([
      'First w1.',
      'Second w1.',
    ])
    expect(await db.card.count()).toBe(20)
  })

  it('is idempotent: a second call returns the same cards', async () => {
    await seedWords(db, 5)
    const first = await getStudyToday(db, userId, now, null)
    const second = await getStudyToday(db, userId, new Date(now.getTime() + 60_000), null)
    expect(second.cards.map((c) => c.cardId)).toEqual(first.cards.map((c) => c.cardId))
    expect(await db.card.count()).toBe(5)
  })

  it('skips words without a meaning', async () => {
    await seedWords(db, 2)
    await db.word.create({ data: { lemma: 'raw', tslRank: 99 } })
    const res = await getStudyToday(db, userId, now, null)
    expect(res.cards.map((c) => c.word.lemma)).toEqual(['w1', 'w2'])
  })

  it('respects a custom newPerDay', async () => {
    await seedWords(db, 5)
    await db.user.update({ where: { id: userId }, data: { newPerDay: 2 } })
    expect((await getStudyToday(db, userId, now, null)).newCount).toBe(2)
  })

  it('reviewed-today cards use up the new budget', async () => {
    await seedWords(db, 10)
    await db.user.update({ where: { id: userId }, data: { newPerDay: 3 } })
    const first = await getStudyToday(db, userId, now, null)
    for (const card of first.cards.slice(0, 2)) await review(db, card.cardId, card.state, now)

    const later = new Date(now.getTime() + 60_000)
    const second = await getStudyToday(db, userId, later, null)
    expect(second.newCount).toBe(1)
    expect(second.cards.filter((c) => c.isNew).map((c) => c.word.lemma)).toEqual(['w3'])
    // The two reviewed cards are in a 10-minute learning step, so they are due again today.
    expect(second.dueCount).toBe(2)
    expect(await db.card.count()).toBe(3)
  })

  it('the new budget resets at local midnight', async () => {
    await seedWords(db, 10)
    await db.user.update({ where: { id: userId }, data: { newPerDay: 3 } })
    const yesterday = new Date('2026-11-11T16:59:00.000Z') // 23:59 the day before, local
    const first = await getStudyToday(db, userId, yesterday, null)
    for (const card of first.cards) await review(db, card.cardId, card.state, yesterday)

    const today = await getStudyToday(db, userId, now, null)
    expect(today.cards.filter((c) => c.isNew).map((c) => c.word.lemma)).toEqual(['w4', 'w5', 'w6'])
  })

  it('due cards come first, ordered by due, then new cards', async () => {
    await seedWords(db, 4)
    await db.user.update({ where: { id: userId }, data: { newPerDay: 2 } })
    const first = await getStudyToday(db, userId, now, null)
    const [a, b] = first.cards
    await review(db, a!.cardId, a!.state, new Date(now.getTime() + 5 * 60_000))
    await review(db, b!.cardId, b!.state, now)

    const res = await getStudyToday(db, userId, new Date(now.getTime() + 6 * 60_000), null)
    expect(res.cards.map((c) => [c.word.lemma, c.isNew])).toEqual([
      ['w2', false],
      ['w1', false],
    ])
    expect(res).toMatchObject({ dueCount: 2, newCount: 0 })
  })

  it('a card due after local midnight is not in today', async () => {
    await seedWords(db, 2)
    const first = await getStudyToday(db, userId, now, null)
    const reviewed = { state: 2, reps: 2, lastReview: new Date('2026-11-10T03:00:00.000Z') }
    await db.card.update({
      where: { id: first.cards[0]!.cardId },
      data: { ...reviewed, due: new Date('2026-11-12T16:59:00.000Z') },
    })
    await db.card.update({
      where: { id: first.cards[1]!.cardId },
      data: { ...reviewed, due: new Date('2026-11-12T17:30:00.000Z') },
    })
    const res = await getStudyToday(db, userId, now, null)
    expect(res.cards.map((c) => c.word.lemma)).toEqual(['w1'])
    expect(res.dueCount).toBe(1)
  })

  it('builds audio URLs only when base URL and key both exist', async () => {
    const [w1] = await seedWords(db, 2)
    await db.word.update({ where: { id: w1!.id }, data: { audioKey: 'audio/words/x.mp3' } })
    await db.example.updateMany({
      where: { wordId: w1!.id },
      data: { audioKey: 'audio/examples/y.mp3' },
    })
    const withBase = await getStudyToday(db, userId, now, 'https://cdn.test')
    expect(withBase.cards[0]!.word.audioUrl).toBe('https://cdn.test/audio/words/x.mp3')
    expect(withBase.cards[0]!.word.examples[0]!.audioUrl).toBe(
      'https://cdn.test/audio/examples/y.mp3',
    )
    expect(withBase.cards[1]!.word.audioUrl).toBeNull()
    const withoutBase = await getStudyToday(db, userId, now, null)
    expect(withoutBase.cards[0]!.word.audioUrl).toBeNull()
  })

  it("does not return another user's cards", async () => {
    await seedWords(db, 2)
    const other = await seedUser(db, 'other@mail.com', 'secret123')
    await getStudyToday(db, other.id, now, null)
    const mine = await getStudyToday(db, userId, now, null)
    const theirs = await getStudyToday(db, other.id, now, null)
    expect(mine.cards).toHaveLength(2)
    const theirIds = new Set(theirs.cards.map((c) => c.cardId))
    expect(mine.cards.some((c) => theirIds.has(c.cardId))).toBe(false)
  })

  it('an unlocked LISTEN_TYPE card appears from the next day, without using the new budget', async () => {
    await seedWords(db, 10)
    await db.user.update({ where: { id: userId }, data: { newPerDay: 2 } })
    const first = await getStudyToday(db, userId, now, null)
    const word = first.cards[0]!.word
    await db.card.create({
      data: {
        ...stateToCardData(newCardState(now)),
        due: new Date('2026-11-12T17:00:00.000Z'),
        userId,
        wordId: word.id,
        mode: 'LISTEN_TYPE',
      },
    })

    const today = await getStudyToday(db, userId, now, null)
    expect(today.cards.some((c) => c.mode === 'LISTEN_TYPE')).toBe(false)

    const tomorrow = await getStudyToday(db, userId, new Date('2026-11-13T03:00:00.000Z'), null)
    const listen = tomorrow.cards.filter((c) => c.mode === 'LISTEN_TYPE')
    expect(listen).toHaveLength(1)
    expect(listen[0]).toMatchObject({ isNew: false, word: { lemma: word.lemma } })
    expect(tomorrow.dueCount).toBe(1)
    expect(tomorrow.newCount).toBe(2)
    expect(tomorrow.cards[0]!.mode).toBe('LISTEN_TYPE')
  })
})
