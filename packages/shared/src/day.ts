// A study "day" runs from local midnight to local midnight in the user's time zone.

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh'

const DAY_MS = 24 * 60 * 60 * 1000

function formatterFor(timezone: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: timezone })
  } catch {
    // Unknown zone name: use the app default rather than fail the request.
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone: DEFAULT_TIMEZONE })
  }
}

/** The wall-clock time in the zone, expressed as if it were UTC. */
function wallClock(fmt: Intl.DateTimeFormat, at: Date) {
  const parts: Record<string, number> = {}
  for (const part of fmt.formatToParts(at)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  const { year, month, day, hour, minute, second } = parts as Record<
    'year' | 'month' | 'day' | 'hour' | 'minute' | 'second',
    number
  >
  return { year, month, day, asUtc: Date.UTC(year, month - 1, day, hour, minute, second) }
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
function offsetAt(fmt: Intl.DateTimeFormat, at: Date): number {
  return wallClock(fmt, at).asUtc - Math.floor(at.getTime() / 1000) * 1000
}

/** The instant at which the given local calendar date begins. */
function midnightOf(fmt: Intl.DateTimeFormat, year: number, month: number, day: number): Date {
  const localMidnight = Date.UTC(year, month - 1, day)
  // The offset at midnight can differ from the offset "now" on a day the clocks change,
  // so estimate with one offset and then correct with the offset at the estimate itself.
  const estimate = new Date(localMidnight - offsetAt(fmt, new Date(localMidnight)))
  return new Date(localMidnight - offsetAt(fmt, estimate))
}

export function startOfDay(now: Date, timezone: string): Date {
  const fmt = formatterFor(timezone)
  const { year, month, day } = wallClock(fmt, now)
  return midnightOf(fmt, year, month, day)
}

export function startOfNextDay(now: Date, timezone: string): Date {
  const fmt = formatterFor(timezone)
  const { year, month, day } = wallClock(fmt, now)
  // Date.UTC normalises day overflow (e.g. 31 + 1), giving tomorrow's calendar date.
  const tomorrow = new Date(Date.UTC(year, month - 1, day) + DAY_MS)
  return midnightOf(
    fmt,
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth() + 1,
    tomorrow.getUTCDate(),
  )
}
