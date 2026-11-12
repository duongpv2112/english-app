import {
  applyRating,
  replayReviews,
  type Rating,
  type Review,
  type ReviewBatchResponse,
} from '@english-app/shared'
import type { PrismaClient } from '@prisma/client'
import { AppError } from '../plugins/errorHandler.ts'
import { cardToState, stateToCardData } from './cardState.ts'

interface TimedReview {
  id: string
  cardId: string
  rating: Rating
  reviewedAt: Date
}

/**
 * Records reviews and updates card schedules. Review ids already stored are ignored, so a
 * batch can be resent safely. A review older than the card's last review triggers a full
 * replay of that card's history.
 */
export async function applyReviews(
  db: PrismaClient,
  userId: string,
  reviews: Review[],
  now: Date,
): Promise<ReviewBatchResponse> {
  // Keep the first review of each id.
  const firstById = new Map<string, Review>()
  for (const r of reviews) if (!firstById.has(r.id)) firstById.set(r.id, r)
  const unique = [...firstById.values()]

  const stored = await db.reviewLog.findMany({
    where: { id: { in: unique.map((r) => r.id) } },
    select: { id: true },
  })
  const storedIds = new Set(stored.map((r) => r.id))
  const fresh: TimedReview[] = unique
    .filter((r) => !storedIds.has(r.id))
    .map((r) => ({
      ...r,
      // A client clock ahead of the server must not schedule reviews in the future.
      reviewedAt: new Date(Math.min(Date.parse(r.reviewedAt), now.getTime())),
    }))

  const cardIds = [...new Set(fresh.map((r) => r.cardId))]
  const cards = await db.card.findMany({ where: { id: { in: cardIds }, userId } })
  if (cards.length !== cardIds.length) throw new AppError('NOT_FOUND', 404, 'Card not found')

  for (const card of cards) {
    const mine = fresh
      .filter((r) => r.cardId === card.id)
      .sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime())
    await db.$transaction(async (tx) => {
      let state
      if (card.lastReview && mine[0]!.reviewedAt < card.lastReview) {
        const old = await tx.reviewLog.findMany({ where: { cardId: card.id } })
        state = replayReviews([
          ...old.map((l) => ({ rating: l.rating as Rating, reviewedAt: l.reviewedAt })),
          ...mine,
        ])
      } else {
        state = mine.reduce((s, r) => applyRating(s, r.rating, r.reviewedAt), cardToState(card))
      }
      await tx.reviewLog.createMany({
        data: mine.map((r) => ({
          id: r.id,
          cardId: r.cardId,
          rating: r.rating,
          reviewedAt: r.reviewedAt,
        })),
      })
      await tx.card.update({ where: { id: card.id }, data: stateToCardData(state) })
    })
  }

  return { accepted: fresh.length, duplicates: reviews.length - fresh.length }
}
