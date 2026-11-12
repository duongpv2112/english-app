// The only place that talks to ts-fsrs. Client and server both schedule through these functions,
// with fuzzing off, so the same history always produces the same card state on both sides.
import { createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs'
import { z } from 'zod'

export const ratingSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
/** 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type Rating = z.infer<typeof ratingSchema>

export const cardStateSchema = z.object({
  due: z.iso.datetime(),
  stability: z.number(),
  difficulty: z.number(),
  scheduledDays: z.number(),
  learningSteps: z.number(),
  reps: z.number(),
  lapses: z.number(),
  /** 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  lastReview: z.iso.datetime().nullable(),
})
/** FSRS scheduling state of one card, with dates as ISO strings so it travels as JSON. */
export type CardState = z.infer<typeof cardStateSchema>

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }))

function toFsrs(state: CardState): Card {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.lastReview ? new Date(state.lastReview) : undefined,
  }
}

function fromFsrs(card: Card): CardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as CardState['state'],
    lastReview: card.last_review ? card.last_review.toISOString() : null,
  }
}

export function newCardState(now: Date): CardState {
  return fromFsrs(createEmptyCard(now))
}

export function applyRating(state: CardState, rating: Rating, reviewedAt: Date): CardState {
  return fromFsrs(scheduler.next(toFsrs(state), reviewedAt, rating as Grade).card)
}

/** Rebuilds a card's state from its whole history. `reviews` must already be in review order. */
export function replayReviews(
  createdAt: Date,
  reviews: { rating: Rating; reviewedAt: Date }[],
): CardState {
  return reviews.reduce(
    (state, review) => applyRating(state, review.rating, review.reviewedAt),
    newCardState(createdAt),
  )
}

/** When the card would next be due for each possible rating given now. */
export function previewDue(state: CardState, now: Date): Record<Rating, string> {
  return {
    1: applyRating(state, 1, now).due,
    2: applyRating(state, 2, now).due,
    3: applyRating(state, 3, now).due,
    4: applyRating(state, 4, now).due,
  }
}
