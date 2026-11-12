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
 * replay of that card's history. Each card is updated under a row lock, so concurrent
 * batches for the same card (two devices, a retry) apply on top of each other.
 */
export async function applyReviews(
  db: PrismaClient,
  userId: string,
  reviews: Review[],
  now: Date,
): Promise<ReviewBatchResponse> {
  // Keep the first review of each id.
  const firstById = new Map<string, TimedReview>()
  for (const r of reviews) {
    if (firstById.has(r.id)) continue
    firstById.set(r.id, {
      ...r,
      // A client clock ahead of the server must not schedule reviews in the future.
      reviewedAt: new Date(Math.min(Date.parse(r.reviewedAt), now.getTime())),
    })
  }
  const unique = [...firstById.values()]

  const cardIds = [...new Set(unique.map((r) => r.cardId))]
  const owned = await db.card.count({ where: { id: { in: cardIds }, userId } })
  if (owned !== cardIds.length) throw new AppError('NOT_FOUND', 404, 'Card not found')

  let accepted = 0
  for (const cardId of cardIds) {
    accepted += await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Card" WHERE id = ${cardId} FOR UPDATE`
      const card = await tx.card.findUniqueOrThrow({ where: { id: cardId } })
      const candidates = unique.filter((r) => r.cardId === cardId)
      const stored = await tx.reviewLog.findMany({
        where: { id: { in: candidates.map((r) => r.id) } },
        select: { id: true },
      })
      const storedIds = new Set(stored.map((r) => r.id))
      const mine = candidates
        .filter((r) => !storedIds.has(r.id))
        .sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime())
      if (mine.length === 0) return 0

      let state
      if (card.lastReview && mine[0]!.reviewedAt < card.lastReview) {
        const old = await tx.reviewLog.findMany({ where: { cardId } })
        state = replayReviews([
          ...old.map((l) => ({ rating: l.rating as Rating, reviewedAt: l.reviewedAt })),
          ...mine,
        ])
      } else {
        state = mine.reduce((s, r) => applyRating(s, r.rating, r.reviewedAt), cardToState(card))
      }
      await tx.reviewLog.createMany({
        data: mine.map((r) => ({ id: r.id, cardId, rating: r.rating, reviewedAt: r.reviewedAt })),
      })
      await tx.card.update({ where: { id: cardId }, data: stateToCardData(state) })
      return mine.length
    })
  }

  return { accepted, duplicates: reviews.length - accepted }
}
