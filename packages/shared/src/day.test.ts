import { describe, expect, it } from 'vitest'
import { localDayRange } from './day.ts'

describe('localDayRange', () => {
  it('uses Vietnam local midnight', () => {
    expect(localDayRange(new Date('2026-11-12T18:30:00Z'), 'Asia/Ho_Chi_Minh')).toEqual({
      start: new Date('2026-11-12T17:00:00Z'),
      end: new Date('2026-11-13T17:00:00Z'),
    })
  })

  it('23:50 and 00:10 local fall on different days', () => {
    const a = localDayRange(new Date('2026-11-12T16:50:00Z'), 'Asia/Ho_Chi_Minh')
    const b = localDayRange(new Date('2026-11-12T17:10:00Z'), 'Asia/Ho_Chi_Minh')
    expect(a.end).toEqual(b.start)
  })

  it('handles a 23-hour DST day', () => {
    expect(localDayRange(new Date('2026-03-08T15:00:00Z'), 'America/New_York')).toEqual({
      start: new Date('2026-03-08T05:00:00Z'),
      end: new Date('2026-03-09T04:00:00Z'),
    })
  })

  it('handles a 25-hour DST day', () => {
    expect(localDayRange(new Date('2026-11-01T15:00:00Z'), 'America/New_York')).toEqual({
      start: new Date('2026-11-01T04:00:00Z'),
      end: new Date('2026-11-02T05:00:00Z'),
    })
  })
})
