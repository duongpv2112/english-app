import type { CardState, CardStateValue } from '@english-app/shared'
import type { Card } from '@prisma/client'

export function cardToState(card: Card): CardState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as CardStateValue,
    lastReview: card.lastReview,
  }
}

/** The Card columns that hold FSRS state, for Prisma `data`. */
export function stateToCardData(s: CardState) {
  return {
    due: s.due,
    stability: s.stability,
    difficulty: s.difficulty,
    scheduledDays: s.scheduledDays,
    learningSteps: s.learningSteps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state,
    lastReview: s.lastReview,
  }
}
