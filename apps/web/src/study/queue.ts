import type { Rating, StudyCard } from '@english-app/shared'

/** How many other cards are shown before a card rated Again comes back. */
export const REQUEUE_GAP = 3

/**
 * Where a just-rated card goes in the session. `rest` is the queue without it and `card` already
 * carries its new state. A card that is due again before the day ends stays in the session:
 * soon after Again, at the end otherwise. A card due tomorrow or later is done for today.
 */
export function requeue(
  rest: StudyCard[],
  card: StudyCard,
  rating: Rating,
  dayEndsAt: Date,
): StudyCard[] {
  if (new Date(card.state.due).getTime() >= dayEndsAt.getTime()) return [...rest]
  const again = { ...card, isNew: false }
  const position = rating === 1 ? Math.min(REQUEUE_GAP, rest.length) : rest.length
  return [...rest.slice(0, position), again, ...rest.slice(position)]
}
