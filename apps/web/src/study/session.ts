import {
  applyRating,
  parseCardState,
  type CardState,
  type Rating,
  type Review,
  type StudyCard,
  type StudyTodayResponse,
} from '@english-app/shared'

export interface SessionItem {
  card: StudyCard
  state: CardState
}

export interface Session {
  queue: SessionItem[]
  dayEnd: Date
  reviewed: number
}

export function createSession(today: StudyTodayResponse): Session {
  return {
    queue: today.cards.map((card) => ({ card, state: parseCardState(card.state) })),
    dayEnd: new Date(today.dayEnd),
    reviewed: 0,
  }
}

export function currentItem(s: Session): SessionItem | undefined {
  return s.queue[0]
}

/**
 * Rates the current card. If FSRS schedules it again before the day ends it goes back into
 * the queue, after every card due no later than it; otherwise it leaves the session.
 */
export function rateCurrent(
  s: Session,
  rating: Rating,
  now: Date,
  newId: () => string,
): { session: Session; review: Review } {
  const [item, ...rest] = s.queue
  if (!item) throw new Error('No card to rate')
  const state = applyRating(item.state, rating, now)
  const queue = [...rest]
  if (state.due < s.dayEnd) {
    const at = queue.findIndex((q) => q.state.due > state.due)
    queue.splice(at === -1 ? queue.length : at, 0, { card: item.card, state })
  }
  return {
    session: { ...s, queue, reviewed: s.reviewed + 1 },
    review: { id: newId(), cardId: item.card.cardId, rating, reviewedAt: now.toISOString() },
  }
}
