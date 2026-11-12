import { applyRating, newCardState, replayReviews, type Rating } from '@english-app/shared'
import type { User } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from '../../test/db.ts'
import { seedTestUser, seedWords } from '../../test/fixtures.ts'
import { applyReviews } from './applyReviews.ts'
import { cardToState } from './cardState.ts'
import { buildTodayQueue } from './todayQueue.ts'

const db = testDb()
const t0 = new Date('2026-11-12T03:00:00Z')
const t1 = new Date('2026-11-12T03:10:00Z')
const now = new Date('2026-11-12T04:00:00Z')

const review = (cardId: string, rating: Rating, at: Date, id: string = crypto.randomUUID()) => ({
  id,
  cardId,
  rating,
  reviewedAt: at.toISOString(),
})

describe('applyReviews', () => {
  let user: User
  let cardId: string
  beforeEach(async () => {
    await resetDb(db)
    user = await seedTestUser(db)
    await seedWords(db, 2)
    cardId = (await buildTodayQueue(db, user.id, t0)).cards[0]!.cardId
  })
  afterAll(() => db.$disconnect())

  const state = async () => cardToState(await db.card.findUniqueOrThrow({ where: { id: cardId } }))

  it('applies a Good rating and writes a log', async () => {
    expect(await applyReviews(db, user.id, [review(cardId, 3, t0)], now)).toEqual({
      accepted: 1,
      duplicates: 0,
    })
    const s = await state()
    expect(s).toMatchObject({ state: 1, reps: 1 })
    expect(s.due).toEqual(new Date('2026-11-12T03:10:00Z'))
    expect(await db.reviewLog.count()).toBe(1)
  })

  it('applies several reviews of one card in time order', async () => {
    await applyReviews(db, user.id, [review(cardId, 3, t1), review(cardId, 1, t0)], now)
    expect(await state()).toEqual(applyRating(applyRating(newCardState(t0), 1, t0), 3, t1))
  })

  it('ignores a batch sent twice', async () => {
    const batch = [review(cardId, 3, t0)]
    await applyReviews(db, user.id, batch, now)
    const before = await state()
    expect(await applyReviews(db, user.id, batch, now)).toEqual({ accepted: 0, duplicates: 1 })
    expect(await state()).toEqual(before)
    expect(await db.reviewLog.count()).toBe(1)
  })

  it('ignores duplicate ids inside one batch', async () => {
    const id = crypto.randomUUID()
    const res = await applyReviews(
      db,
      user.id,
      [review(cardId, 3, t0, id), review(cardId, 1, t1, id)],
      now,
    )
    expect(res).toEqual({ accepted: 1, duplicates: 1 })
  })

  it('recomputes from all logs when an older review arrives late', async () => {
    await applyReviews(db, user.id, [review(cardId, 3, t1)], now)
    await applyReviews(db, user.id, [review(cardId, 1, t0)], now)
    expect(await state()).toEqual(
      replayReviews([
        { rating: 1, reviewedAt: t0 },
        { rating: 3, reviewedAt: t1 },
      ]),
    )
    expect(await db.reviewLog.count()).toBe(2)
  })

  it('clamps a reviewedAt in the future to now', async () => {
    const future = new Date(now.getTime() + 24 * 3600_000)
    await applyReviews(db, user.id, [review(cardId, 3, future)], now)
    expect((await state()).lastReview).toEqual(now)
    expect((await db.reviewLog.findFirstOrThrow()).reviewedAt).toEqual(now)
  })

  it('rejects an unknown card with NOT_FOUND and writes nothing', async () => {
    await expect(
      applyReviews(db, user.id, [review(cardId, 3, t0), review('nope', 3, t0)], now),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(await db.reviewLog.count()).toBe(0)
  })

  it("rejects another user's card with NOT_FOUND", async () => {
    const other = await db.user.create({ data: { email: 'other@mail.com', passwordHash: 'x' } })
    await expect(applyReviews(db, other.id, [review(cardId, 3, t0)], now)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('applyReviews concurrency', () => {
  let user: User
  let cardId: string
  beforeEach(async () => {
    await resetDb(db)
    user = await seedTestUser(db)
    await seedWords(db, 1)
    cardId = (await buildTodayQueue(db, user.id, t0)).cards[0]!.cardId
  })

  it('two batches for the same card at once both count', async () => {
    await Promise.all([
      applyReviews(db, user.id, [review(cardId, 1, t0)], now),
      applyReviews(db, user.id, [review(cardId, 3, t1)], now),
    ])
    const s = cardToState(await db.card.findUniqueOrThrow({ where: { id: cardId } }))
    expect(s).toEqual(
      replayReviews([
        { rating: 1, reviewedAt: t0 },
        { rating: 3, reviewedAt: t1 },
      ]),
    )
  })

  it('the same review sent twice at once is stored once without an error', async () => {
    const batch = [review(cardId, 3, t0)]
    const results = await Promise.all([
      applyReviews(db, user.id, batch, now),
      applyReviews(db, user.id, batch, now),
    ])
    expect(results.map((r) => r.accepted).sort()).toEqual([0, 1])
    expect(await db.reviewLog.count()).toBe(1)
  })
})
