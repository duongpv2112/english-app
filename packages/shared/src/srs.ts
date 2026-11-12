import { createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs'

export type Rating = 1 | 2 | 3 | 4
/** 0 New, 1 Learning, 2 Review, 3 Relearning */
export type CardStateValue = 0 | 1 | 2 | 3

export interface CardState {
  due: Date
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: CardStateValue
  lastReview: Date | null
}

// No fuzz, so the client and the server compute the same schedule.
const scheduler = fsrs({ enable_fuzz: false })

function toFsrs(c: CardState): Card {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduledDays,
    learning_steps: c.learningSteps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.lastReview ?? undefined,
  } as Card
}

function fromFsrs(c: Card): CardState {
  return {
    due: c.due,
    stability: c.stability,
    difficulty: c.difficulty,
    scheduledDays: c.scheduled_days,
    learningSteps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as CardStateValue,
    lastReview: c.last_review ?? null,
  }
}

export function newCardState(now: Date): CardState {
  return fromFsrs(createEmptyCard(now))
}

export function applyRating(card: CardState, rating: Rating, at: Date): CardState {
  return fromFsrs(scheduler.next(toFsrs(card), at, rating as Grade).card)
}

/** Recomputes a card's state from its whole review history, in time order. */
export function replayReviews(reviews: { rating: Rating; reviewedAt: Date }[]): CardState {
  if (reviews.length === 0) throw new Error('replayReviews needs at least one review')
  const sorted = [...reviews].sort((a, b) => a.reviewedAt.getTime() - b.reviewedAt.getTime())
  return sorted.reduce(
    (card, r) => applyRating(card, r.rating, r.reviewedAt),
    newCardState(sorted[0]!.reviewedAt),
  )
}
