const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** Local wall-clock fields of `t` in `timeZone`. */
function localParts(t: number, timeZone: string) {
  const p = Object.fromEntries(
    formatter(timeZone)
      .formatToParts(t)
      .map((x) => [x.type, Number(x.value)]),
  )
  return { y: p.year!, m: p.month!, d: p.day!, h: p.hour!, min: p.minute!, s: p.second! }
}

/** Local time minus UTC, in ms, at instant `t`. */
function offset(t: number, timeZone: string): number {
  const p = localParts(t, timeZone)
  const flooredT = Math.floor(t / 1000) * 1000
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - flooredT
}

/** UTC instant of local midnight at the start of local date (y, m, d). */
function localMidnight(y: number, m: number, d: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offset(guess, timeZone)
  // Second pass corrects the offset when a DST change falls between guess and t.
  t = guess - offset(t, timeZone)
  return new Date(t)
}

/** The local calendar day (00:00 to next 00:00 in `timeZone`) that contains `now`. */
export function localDayRange(now: Date, timeZone: string): { start: Date; end: Date } {
  const { y, m, d } = localParts(now.getTime(), timeZone)
  return { start: localMidnight(y, m, d, timeZone), end: localMidnight(y, m, d + 1, timeZone) }
}
