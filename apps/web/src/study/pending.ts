// Work that has not reached the server yet. Kept in localStorage so that closing the tab or
// losing the connection does not lose it.
import {
  dictationAttemptInputSchema,
  reviewInputSchema,
  type DictationAttemptInput,
  type ReviewInput,
} from '@english-app/shared'
import { z, type ZodType } from 'zod'

export function pendingQueue<T>(key: string, schema: ZodType<T>) {
  return {
    load(): T[] {
      try {
        const parsed = z.array(schema).safeParse(JSON.parse(localStorage.getItem(key) ?? '[]'))
        return parsed.success ? parsed.data : []
      } catch {
        // Corrupt data, or storage is unavailable (private mode).
        return []
      }
    },
    save(list: T[]): void {
      try {
        if (list.length === 0) localStorage.removeItem(key)
        else localStorage.setItem(key, JSON.stringify(list))
      } catch {
        // Storage full or unavailable: the items still live in memory for this visit.
      }
    },
  }
}

/** Card ratings waiting to be sent. */
export const pendingReviews = pendingQueue<ReviewInput>(
  'english-app:pending-reviews',
  reviewInputSchema,
)
/** Dictation attempts waiting to be sent. */
export const pendingAttempts = pendingQueue<DictationAttemptInput>(
  'english-app:pending-dictation',
  dictationAttemptInputSchema,
)
