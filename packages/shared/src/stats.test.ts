import { describe, expect, it } from 'vitest'
import { currentStreak, requiredKnown, TARGET_WORDS } from './stats.ts'

describe('requiredKnown', () => {
  const start = new Date('2026-11-01T00:00:00.000Z')
  const target = new Date('2027-02-01T00:00:00.000Z') // 92 days later
  const day = (n: number) => new Date(start.getTime() + n * 86_400_000)

  it('is linear and clamped', () => {
    expect(requiredKnown(start, target, start)).toBe(0)
    expect(requiredKnown(start, target, day(46))).toBe(600)
    expect(requiredKnown(start, target, target)).toBe(TARGET_WORDS)
    expect(requiredKnown(start, target, day(-5))).toBe(0)
    expect(requiredKnown(start, target, day(200))).toBe(TARGET_WORDS)
  })

  it('a start on or after the target requires everything', () => {
    expect(requiredKnown(target, target, target)).toBe(TARGET_WORDS)
  })
})

describe('currentStreak', () => {
  it('counts back from today, or from yesterday when today is empty', () => {
    expect(currentStreak(['2026-11-12', '2026-11-13', '2026-11-14'], '2026-11-14')).toEqual({
      current: 3,
      studiedToday: true,
    })
    expect(currentStreak(['2026-11-12', '2026-11-13'], '2026-11-14')).toEqual({
      current: 2,
      studiedToday: false,
    })
    expect(currentStreak(['2026-11-10', '2026-11-12'], '2026-11-14')).toEqual({
      current: 0,
      studiedToday: false,
    })
    expect(currentStreak([], '2026-11-14')).toEqual({ current: 0, studiedToday: false })
  })

  it('ignores order and duplicates, and crosses month ends', () => {
    expect(currentStreak(['2026-12-01', '2026-11-30', '2026-12-01'], '2026-12-01')).toEqual({
      current: 2,
      studiedToday: true,
    })
  })
})
