import { applyRating, newCardState } from '@english-app/shared'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedWords } from '../../test/content.ts'
import { resetDb, testDb } from '../../test/db.ts'
import { seedUser } from '../seed.ts'
import { stateToCardData } from './cardState.ts'
import { applyReviewBatch } from './reviews.ts'
import { getStatsOverview } from './stats.ts'
import { countToday, getStudyToday } from './studyQueue.ts'

const db = testDb()
// Saturday 14 November, 10:00 in Ho Chi Minh.
const now = new Date('2026-11-14T03:00:00.000Z')

describe('stats overview', () => {
  let userId: string

  beforeEach(async () => {
    await resetDb(db)
    userId = (await seedUser(db, 'me@mail.com', 'secret123')).id
    await db.user.update({
      where: { id: userId },
      data: { startedAt: new Date('2026-11-01T00:00:00.000Z') },
    })
  })
  afterAll(() => db.$disconnect())

  async function anyCardId() {
    await seedWords(db, 1)
    return (await getStudyToday(db, userId, now, null)).cards[0]!.cardId
  }
  const log = (cardId: string, at: string) =>
    db.reviewLog.create({ data: { id: randomUUID(), cardId, rating: 3, reviewedAt: new Date(at) } })
  const attempt = async (score: number, at: string) => {
    const example = await db.example.findFirstOrThrow()
    await db.dictationAttempt.create({
      data: {
        id: randomUUID(),
        userId,
        exampleId: example.id,
        input: '',
        score,
        diff: [],
        createdAt: new Date(at),
      },
    })
  }

  it('a new user gets zeros and eight empty weeks', async () => {
    const stats = await getStatsOverview(db, userId, now)
    expect(stats.today).toEqual({ dueCount: 0, newCount: 0 })
    expect(stats.streak).toEqual({ current: 0, studiedToday: false })
    expect(stats.progress).toEqual({
      known: 0,
      target: 1200,
      // 13 days 10 hours into a 92-day span that starts at local midnight on 1 November.
      required: 175,
      targetDate: '2027-02-01',
      // 79 days left, today included.
      neededPerDay: 16,
    })
    expect(stats.dictationWeeks.map((w) => w.weekStart)).toEqual([
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
    ])
    expect(stats.dictationWeeks.every((w) => w.average === null && w.attempts === 0)).toBe(true)
  })

  it('today counts match /study/today and create no cards', async () => {
    await seedWords(db, 25)
    expect(await countToday(db, userId, now)).toEqual({ dueCount: 0, newCount: 20 })
    expect(await db.card.count()).toBe(0)

    const today = await getStudyToday(db, userId, now, null)
    await applyReviewBatch(
      db,
      userId,
      today.cards.slice(0, 2).map((c) => ({
        id: randomUUID(),
        cardId: c.cardId,
        rating: 3 as const,
        reviewedAt: now.toISOString(),
      })),
      now,
    )
    const later = new Date(now.getTime() + 60_000)
    const counted = await countToday(db, userId, later)
    const cards = await db.card.count()
    const queue = await getStudyToday(db, userId, later, null)
    expect(counted).toEqual({ dueCount: queue.dueCount, newCount: queue.newCount })
    expect(counted).toEqual({ dueCount: 2, newCount: 18 })
    expect(await db.card.count()).toBe(cards)
  })

  it('streak counts local days with reviews or dictation', async () => {
    const cardId = await anyCardId()
    await log(cardId, '2026-11-12T16:30:00.000Z') // 23:30 on the 12th, local
    await log(cardId, '2026-11-12T17:30:00.000Z') // 00:30 on the 13th, local
    await attempt(1, '2026-11-14T02:00:00.000Z')
    expect((await getStatsOverview(db, userId, now)).streak).toEqual({
      current: 3,
      studiedToday: true,
    })
  })

  it('streak follows the user time zone', async () => {
    const cardId = await anyCardId()
    await log(cardId, '2026-11-12T16:30:00.000Z')
    await log(cardId, '2026-11-12T17:30:00.000Z')
    await attempt(1, '2026-11-14T02:00:00.000Z')
    await db.user.update({ where: { id: userId }, data: { timezone: 'UTC' } })
    // In UTC both reviews fall on the 12th, so the 13th is a gap.
    expect((await getStatsOverview(db, userId, now)).streak).toEqual({
      current: 1,
      studiedToday: true,
    })
  })

  it('a streak survives until the day is over', async () => {
    const cardId = await anyCardId()
    await log(cardId, '2026-11-13T03:00:00.000Z')
    expect((await getStatsOverview(db, userId, now)).streak).toEqual({
      current: 1,
      studiedToday: false,
    })
  })

  it('known counts only RECOGNIZE cards in Review', async () => {
    const words = await seedWords(db, 4)
    const review = stateToCardData(applyRating(newCardState(now), 4, now))
    const card = (i: number, mode: 'RECOGNIZE' | 'LISTEN_TYPE', state: number) =>
      db.card.create({ data: { ...review, state, userId, wordId: words[i]!.id, mode } })
    await card(0, 'RECOGNIZE', 2)
    await card(1, 'RECOGNIZE', 2)
    await card(2, 'RECOGNIZE', 3)
    await card(0, 'LISTEN_TYPE', 2)
    expect((await getStatsOverview(db, userId, now)).progress.known).toBe(2)
  })

  it('neededPerDay is null once the target date has passed', async () => {
    const progress = (await getStatsOverview(db, userId, new Date('2027-03-01T00:00:00.000Z')))
      .progress
    expect(progress).toMatchObject({ required: 1200, neededPerDay: null })
  })

  it('weekly dictation averages', async () => {
    await seedWords(db, 1)
    await attempt(0.5, '2026-11-12T03:00:00.000Z')
    await attempt(1, '2026-11-14T02:00:00.000Z')
    await attempt(0, '2026-11-08T18:00:00.000Z') // Monday 9 November, 01:00 local
    await attempt(0.25, '2026-11-05T03:00:00.000Z')
    await attempt(0.9, '2025-01-01T03:00:00.000Z') // long ago, not shown
    const weeks = (await getStatsOverview(db, userId, now)).dictationWeeks
    expect(weeks.at(-1)).toEqual({ weekStart: '2026-11-09', average: 0.5, attempts: 3 })
    expect(weeks.at(-2)).toEqual({ weekStart: '2026-11-02', average: 0.25, attempts: 1 })
    expect(weeks.slice(0, -2).every((w) => w.attempts === 0)).toBe(true)
  })
})
