import { describe, expect, it } from 'vitest'
import { startOfDay, startOfNextDay } from './day.ts'

const iso = (d: Date) => d.toISOString()

describe('day boundaries', () => {
  it('start of day in Ho Chi Minh (UTC+7)', () => {
    const now = new Date('2026-11-12T20:00:00Z') // 03:00 on the 13th, local
    expect(iso(startOfDay(now, 'Asia/Ho_Chi_Minh'))).toBe('2026-11-12T17:00:00.000Z')
    expect(iso(startOfNextDay(now, 'Asia/Ho_Chi_Minh'))).toBe('2026-11-13T17:00:00.000Z')
  })

  it('the instant of local midnight belongs to the new day', () => {
    const midnight = new Date('2026-11-12T17:00:00.000Z')
    expect(iso(startOfDay(midnight, 'Asia/Ho_Chi_Minh'))).toBe('2026-11-12T17:00:00.000Z')
    const justBefore = new Date('2026-11-12T16:59:59.999Z')
    expect(iso(startOfDay(justBefore, 'Asia/Ho_Chi_Minh'))).toBe('2026-11-11T17:00:00.000Z')
  })

  it('handles a zone behind UTC and a DST change day', () => {
    // 2026-03-08 in New York has 23 hours: clocks jump from 02:00 EST to 03:00 EDT.
    const now = new Date('2026-03-08T15:00:00Z')
    expect(iso(startOfDay(now, 'America/New_York'))).toBe('2026-03-08T05:00:00.000Z')
    expect(iso(startOfNextDay(now, 'America/New_York'))).toBe('2026-03-09T04:00:00.000Z')
  })

  it('works in UTC', () => {
    expect(iso(startOfDay(new Date('2026-05-05T12:34:56Z'), 'UTC'))).toBe(
      '2026-05-05T00:00:00.000Z',
    )
  })

  it('falls back to the default zone for an invalid zone name', () => {
    const now = new Date('2026-11-12T20:00:00Z')
    expect(iso(startOfDay(now, 'Not/AZone'))).toBe('2026-11-12T17:00:00.000Z')
    expect(iso(startOfDay(now, ''))).toBe('2026-11-12T17:00:00.000Z')
  })
})
