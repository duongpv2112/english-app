import { z } from 'zod'
import { addDays } from './day.ts'

/** The goal for February 2027: TOEIC 650, which takes about this many TOEIC words. */
export const TARGET_WORDS = 1200
export const TARGET_DATE = '2027-02-01'

/** How many words should be known by now to reach the target on time, at a steady pace. */
export function requiredKnown(start: Date, target: Date, now: Date): number {
  const span = target.getTime() - start.getTime()
  if (span <= 0) return TARGET_WORDS
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / span))
  return Math.round(TARGET_WORDS * elapsed)
}

/**
 * Consecutive study days ending today. A day not yet studied does not break the streak until it
 * is over, so without study today the count runs back from yesterday.
 */
export function currentStreak(
  studyDays: string[],
  today: string,
): { current: number; studiedToday: boolean } {
  const days = new Set(studyDays)
  const studiedToday = days.has(today)
  let day = studiedToday ? today : addDays(today, -1)
  let current = 0
  while (days.has(day)) {
    current++
    day = addDays(day, -1)
  }
  return { current, studiedToday }
}

export const statsOverviewSchema = z.object({
  today: z.object({ dueCount: z.number(), newCount: z.number() }),
  streak: z.object({ current: z.number(), studiedToday: z.boolean() }),
  progress: z.object({
    /** Recognise cards in the FSRS Review state. */
    known: z.number(),
    target: z.number(),
    /** Where a steady pace from the start date would be by now. */
    required: z.number(),
    targetDate: z.string(),
    /** New words a day still needed to reach the target in time; null once reached or too late. */
    neededPerDay: z.number().nullable(),
  }),
  /** The last eight weeks (Monday first), oldest first. */
  dictationWeeks: z.array(
    z.object({ weekStart: z.string(), average: z.number().nullable(), attempts: z.number() }),
  ),
})
export type StatsOverview = z.infer<typeof statsOverviewSchema>
