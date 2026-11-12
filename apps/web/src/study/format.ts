const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A short Vietnamese label for how far away `due` is, e.g. "10 phút" or "4 ngày". */
export function formatInterval(from: Date, due: Date): string {
  const ms = Math.max(0, due.getTime() - from.getTime())
  const minutes = Math.max(1, Math.round(ms / MINUTE))
  if (minutes < 60) return `${minutes} phút`
  const hours = Math.round(ms / HOUR)
  if (hours < 24) return `${hours} giờ`
  const days = Math.round(ms / DAY)
  if (days < 60) return `${days} ngày`
  return `${Math.round(days / 30)} tháng`
}
