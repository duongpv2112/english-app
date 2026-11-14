import {
  addDays,
  currentStreak,
  localDate,
  requiredKnown,
  startOfDay,
  startOfLocalDate,
  TARGET_DATE,
  TARGET_WORDS,
  type StatsOverview,
} from '@english-app/shared'
import type { PrismaClient } from '../db.ts'
import { countToday } from './studyQueue.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKS_SHOWN = 8

/** The Monday on or before a 'YYYY-MM-DD' date. */
function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 is Sunday
  return addDays(date, -((weekday + 6) % 7))
}

/** The overview page: today's work, streak, progress towards the goal and dictation accuracy. */
export async function getStatsOverview(
  db: PrismaClient,
  userId: string,
  now: Date,
): Promise<StatsOverview> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })
  const tz = user.timezone
  const today = localDate(now, tz)

  // Timestamps are stored as UTC; the database turns them into local calendar days.
  const studyDays = await db.$queryRaw<{ day: string }[]>`
    SELECT to_char((l."reviewedAt" AT TIME ZONE 'UTC') AT TIME ZONE CAST(${tz} AS text), 'YYYY-MM-DD') AS day
    FROM "ReviewLog" l JOIN "Card" c ON c.id = l."cardId"
    WHERE c."userId" = ${userId}
    UNION
    SELECT to_char((d."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE CAST(${tz} AS text), 'YYYY-MM-DD')
    FROM "DictationAttempt" d
    WHERE d."userId" = ${userId}`

  const weekRows = await db.$queryRaw<{ week: string; average: number; attempts: number }[]>`
    SELECT
      to_char(date_trunc('week', (d."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE CAST(${tz} AS text)), 'YYYY-MM-DD') AS week,
      AVG(d.score)::float8 AS average,
      COUNT(*)::int AS attempts
    FROM "DictationAttempt" d
    WHERE d."userId" = ${userId}
    GROUP BY 1`
  const byWeek = new Map(weekRows.map((row) => [row.week, row]))
  const thisWeek = mondayOf(today)
  const dictationWeeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => {
    const weekStart = addDays(thisWeek, -7 * (WEEKS_SHOWN - 1 - i))
    const row = byWeek.get(weekStart)
    return { weekStart, average: row?.average ?? null, attempts: row?.attempts ?? 0 }
  })

  const known = await db.card.count({ where: { userId, mode: 'RECOGNIZE', state: 2 } })
  const target = startOfLocalDate(TARGET_DATE, tz)
  const daysLeft = Math.round((target.getTime() - startOfDay(now, tz).getTime()) / DAY_MS)

  return {
    today: await countToday(db, userId, now),
    streak: currentStreak(
      studyDays.map((row) => row.day),
      today,
    ),
    progress: {
      known,
      target: TARGET_WORDS,
      required: requiredKnown(startOfDay(user.startedAt, tz), target, now),
      targetDate: TARGET_DATE,
      neededPerDay:
        known >= TARGET_WORDS || daysLeft <= 0
          ? null
          : Math.ceil((TARGET_WORDS - known) / daysLeft),
    },
    dictationWeeks,
  }
}
