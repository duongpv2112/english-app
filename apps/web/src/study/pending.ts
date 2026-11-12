// Ratings that have not reached the server yet. Kept in localStorage so that closing the tab or
// losing the connection does not lose them.
import { reviewInputSchema, type ReviewInput } from '@english-app/shared'
import { z } from 'zod'

const KEY = 'english-app:pending-reviews'

export function loadPending(): ReviewInput[] {
  try {
    const parsed = z
      .array(reviewInputSchema)
      .safeParse(JSON.parse(localStorage.getItem(KEY) ?? '[]'))
    return parsed.success ? parsed.data : []
  } catch {
    // Corrupt data, or storage is unavailable (private mode).
    return []
  }
}

export function savePending(list: ReviewInput[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // Storage full or unavailable: the reviews still live in memory for this visit.
  }
}
