import type { CardState } from '@english-app/shared'
import type { Card } from '../db.ts'

/** The FSRS state stored on a card row, in the shape shared with the client. */
export function cardToState(card: Card): CardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningSteps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as CardState['state'],
    lastReview: card.lastReview ? card.lastReview.toISOString() : null,
  }
}

/** The column values that store the given FSRS state on a card row. */
export function stateToCardData(state: CardState) {
  return {
    due: new Date(state.due),
    stability: state.stability,
    difficulty: state.difficulty,
    scheduledDays: state.scheduledDays,
    learningSteps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    lastReview: state.lastReview ? new Date(state.lastReview) : null,
  }
}
