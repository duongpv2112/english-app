import type { Rating } from '@english-app/shared'

export type KeyAction = { type: 'flip' } | { type: 'rate'; rating: Rating }

const RATING_KEYS: Record<string, Rating> = { '1': 1, '2': 2, '3': 3, '4': 4 }

/** Study shortcuts: Space flips, 1-4 rate. Browser shortcuts (Ctrl/Cmd/Alt) and auto-repeat are ignored. */
export function keyAction(e: KeyboardEvent, flipped: boolean): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null
  if (e.key === ' ') return flipped ? null : { type: 'flip' }
  const rating = RATING_KEYS[e.key]
  return rating && flipped ? { type: 'rate', rating } : null
}
