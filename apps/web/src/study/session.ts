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

/** The first card in the queue that is due at `now`; learning cards wait for their step. */
export function currentItem(s: Session, now: Date): SessionItem | undefined {
  return s.queue.find((i) => i.state.due <= now)
}

/** When the next waiting card becomes due, or null when the session is finished. */
export function nextDueAt(s: Session): Date | null {
  if (s.queue.length === 0) return null
  return new Date(Math.min(...s.queue.map((i) => i.state.due.getTime())))
}

/** Countdown text like "9:59" for a wait of `ms` milliseconds (rounded up to the second). */
export function formatWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * Rates the current (due) card. If FSRS schedules it again before the day ends it goes back into
 * the queue, after every card due no later than it; otherwise it leaves the session.
 */
export function rateCurrent(
  s: Session,
  rating: Rating,
  now: Date,
  newId: () => string,
): { session: Session; review: Review } {
  const item = currentItem(s, now)
  if (!item) throw new Error('No card due to rate')
  const state = applyRating(item.state, rating, now)
  const queue = s.queue.filter((i) => i !== item)
  if (state.due < s.dayEnd) {
    const at = queue.findIndex((q) => q.state.due > state.due)
    queue.splice(at === -1 ? queue.length : at, 0, { card: item.card, state })
  }
  return {
    session: { ...s, queue, reviewed: s.reviewed + 1 },
    review: { id: newId(), cardId: item.card.cardId, rating, reviewedAt: now.toISOString() },
  }
}
