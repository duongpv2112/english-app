import {
  applyRating,
  replayReviews,
  type Rating,
  type ReviewBatchResponse,
  type ReviewInput,
} from '@english-app/shared'
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '../db.ts'
import { cardToState, stateToCardData } from './cardState.ts'

type Review = { id: string; rating: Rating; reviewedAt: Date }

const inReviewOrder = (a: Review, b: Review) =>
  a.reviewedAt.getTime() - b.reviewedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Stores a batch of ratings and brings the affected cards up to date. Safe to call again with the
 * same reviews (ids already stored are skipped), and reviews may arrive in any order: one that is
 * older than the card's last review makes the card's state get rebuilt from its full history.
 */
export async function applyReviewBatch(
  db: PrismaClient,
  userId: string,
  reviews: ReviewInput[],
  now: Date,
): Promise<ReviewBatchResponse> {
  let duplicates = 0
  const unique = new Map<string, ReviewInput>()
  for (const review of reviews) {
    if (unique.has(review.id)) duplicates++
    else unique.set(review.id, review)
  }

  return db.$transaction(async (tx) => {
    const cardIds = [...new Set([...unique.values()].map((r) => r.cardId))]
    // Lock the cards so two batches for the same card (two tabs or devices) apply one after another.
    await tx.$queryRaw`SELECT id FROM "Card" WHERE id IN (${Prisma.join(cardIds)}) AND "userId" = ${userId} FOR UPDATE`
    const cards = await tx.card.findMany({ where: { id: { in: cardIds }, userId } })
    const cardById = new Map(cards.map((c) => [c.id, c]))

    const stored = await tx.reviewLog.findMany({
      where: { id: { in: [...unique.keys()] } },
      select: { id: true },
    })
    const storedIds = new Set(stored.map((l) => l.id))

    const rejected: string[] = []
    const newByCard = new Map<string, Review[]>()
    for (const review of unique.values()) {
      if (storedIds.has(review.id)) {
        duplicates++
        continue
      }
      if (!cardById.has(review.cardId)) {
        rejected.push(review.id)
        continue
      }
      // A client clock that runs ahead must not push a review into the future.
      const reviewedAt = new Date(Math.min(new Date(review.reviewedAt).getTime(), now.getTime()))
      const list = newByCard.get(review.cardId) ?? []
      list.push({ id: review.id, rating: review.rating, reviewedAt })
      newByCard.set(review.cardId, list)
    }

    const updated: ReviewBatchResponse['cards'] = []
    let applied = 0
    for (const [cardId, fresh] of newByCard) {
      const card = cardById.get(cardId)!
      fresh.sort(inReviewOrder)

      let state
      const isLate = card.lastReview !== null && fresh[0]!.reviewedAt <= card.lastReview
      if (isLate) {
        const earlier = await tx.reviewLog.findMany({ where: { cardId } })
        const history = [
          ...earlier.map((l) => ({
            id: l.id,
            rating: l.rating as Rating,
            reviewedAt: l.reviewedAt,
          })),
          ...fresh,
        ].sort(inReviewOrder)
        state = replayReviews(card.createdAt, history)
      } else {
        state = fresh.reduce(
          (s, review) => applyRating(s, review.rating, review.reviewedAt),
          cardToState(card),
        )
      }

      await tx.reviewLog.createMany({
        data: fresh.map((review) => ({ ...review, cardId, receivedAt: now })),
      })
      await tx.card.update({ where: { id: cardId }, data: stateToCardData(state) })
      applied += fresh.length
      updated.push({ cardId, state })
    }

    return { applied, duplicates, rejected, cards: updated }
  })
}
