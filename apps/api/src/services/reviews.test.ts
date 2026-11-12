import {
  applyRating,
  newCardState,
  replayReviews,
  type Rating,
  type ReviewInput,
  type StudyCard,
} from '@english-app/shared'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { seedUser } from '../seed.ts'
import { cardToState } from './cardState.ts'
import { applyReviewBatch } from './reviews.ts'
import { getStudyToday } from './studyQueue.ts'

const db = testDb()
const t = new Date('2026-11-12T03:00:00.000Z')
const plus = (minutes: number) => new Date(t.getTime() + minutes * 60_000)
const now = plus(60)

function r(card: StudyCard, rating: Rating, at: Date): ReviewInput {
  return { id: randomUUID(), cardId: card.cardId, rating, reviewedAt: at.toISOString() }
}

describe('applyReviewBatch', () => {
  let userId: string
  let cards: StudyCard[]
  const stored = async (card: StudyCard) =>
    cardToState(await db.card.findUniqueOrThrow({ where: { id: card.cardId } }))

  beforeEach(async () => {
    await resetDb(db)
    userId = (await seedUser(db, 'me@mail.com', 'secret123')).id
    await seedWords(db, 3)
    cards = (await getStudyToday(db, userId, t, null)).cards
  })
  afterAll(() => db.$disconnect())

  it('applies a rating: writes the log and updates the card', async () => {
    const review = r(cards[0]!, 3, t)
    const expected = applyRating(newCardState(t), 3, t)
    const res = await applyReviewBatch(db, userId, [review], now)
    expect(res).toEqual({
      applied: 1,
      duplicates: 0,
      rejected: [],
      cards: [{ cardId: cards[0]!.cardId, state: expected }],
    })
    expect(await stored(cards[0]!)).toEqual(expected)
    const log = await db.reviewLog.findUniqueOrThrow({ where: { id: review.id } })
    expect([log.cardId, log.rating, log.reviewedAt.toISOString()]).toEqual([
      cards[0]!.cardId,
      3,
      t.toISOString(),
    ])
  })

  it('applies several ratings for one card in reviewedAt order, whatever the array order', async () => {
    const first = r(cards[0]!, 1, t)
    const second = r(cards[0]!, 3, plus(1))
    const third = r(cards[0]!, 3, plus(11))
    const res = await applyReviewBatch(db, userId, [third, first, second], now)
    const expected = replayReviews(t, [
      { rating: 1, reviewedAt: t },
      { rating: 3, reviewedAt: plus(1) },
      { rating: 3, reviewedAt: plus(11) },
    ])
    expect(res.applied).toBe(3)
    expect(res.cards).toEqual([{ cardId: cards[0]!.cardId, state: expected }])
    expect(await stored(cards[0]!)).toEqual(expected)
  })

  it('updates several cards in one batch', async () => {
    const res = await applyReviewBatch(db, userId, [r(cards[0]!, 3, t), r(cards[1]!, 4, t)], now)
    expect(res.applied).toBe(2)
    expect((await stored(cards[0]!)).state).toBe(1)
    expect((await stored(cards[1]!)).state).toBe(2)
    expect((await stored(cards[2]!)).state).toBe(0)
  })

  it('sending the same batch twice changes nothing the second time', async () => {
    const batch = [r(cards[0]!, 3, t), r(cards[0]!, 3, plus(10)), r(cards[1]!, 1, t)]
    await applyReviewBatch(db, userId, batch, now)
    const before = await stored(cards[0]!)
    const res = await applyReviewBatch(db, userId, batch, now)
    expect(res).toEqual({ applied: 0, duplicates: 3, rejected: [], cards: [] })
    expect(await stored(cards[0]!)).toEqual(before)
    expect(before.reps).toBe(2)
    expect(await db.reviewLog.count()).toBe(3)
  })

  it('a repeated id inside one batch is applied once', async () => {
    const review = r(cards[0]!, 3, t)
    const res = await applyReviewBatch(db, userId, [review, { ...review }], now)
    expect(res).toMatchObject({ applied: 1, duplicates: 1 })
    expect((await stored(cards[0]!)).reps).toBe(1)
  })

  it('rejects reviews for unknown cards and other users’ cards, applies the rest', async () => {
    const other = await seedUser(db, 'other@mail.com', 'secret123')
    const theirs = (await getStudyToday(db, other.id, t, null)).cards[0]!
    const unknown: ReviewInput = { ...r(cards[0]!, 3, t), cardId: 'missing' }
    const foreign = r(theirs, 3, t)
    const good = r(cards[0]!, 3, t)
    const res = await applyReviewBatch(db, userId, [unknown, foreign, good], now)
    expect(res.applied).toBe(1)
    expect(res.rejected.sort()).toEqual([unknown.id, foreign.id].sort())
    expect((await stored(theirs)).reps).toBe(0)
    expect(await db.reviewLog.count()).toBe(1)
  })

  it('a late review triggers a replay of the whole history', async () => {
    await applyReviewBatch(db, userId, [r(cards[0]!, 3, plus(10))], now)
    const res = await applyReviewBatch(db, userId, [r(cards[0]!, 1, t)], now)
    const expected = replayReviews(t, [
      { rating: 1, reviewedAt: t },
      { rating: 3, reviewedAt: plus(10) },
    ])
    expect(res.applied).toBe(1)
    expect(await stored(cards[0]!)).toEqual(expected)
    expect(expected.reps).toBe(2)
  })

  it('clamps reviewedAt in the future to now', async () => {
    const review = r(cards[0]!, 3, plus(60 * 24 * 365))
    await applyReviewBatch(db, userId, [review], now)
    const log = await db.reviewLog.findUniqueOrThrow({ where: { id: review.id } })
    expect(log.reviewedAt.toISOString()).toBe(now.toISOString())
    expect((await stored(cards[0]!)).lastReview).toBe(now.toISOString())
  })

  it('an empty result batch (all duplicates/rejected) does not fail', async () => {
    const unknown: ReviewInput = { ...r(cards[0]!, 3, t), cardId: 'missing' }
    expect(await applyReviewBatch(db, userId, [unknown], now)).toEqual({
      applied: 0,
      duplicates: 0,
      rejected: [unknown.id],
      cards: [],
    })
  })
})
