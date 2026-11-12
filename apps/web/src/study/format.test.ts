import { describe, expect, it } from 'vitest'
import { formatInterval } from './format.ts'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const from = new Date('2026-11-12T03:00:00.000Z')

describe('formatInterval', () => {
  it.each([
    [0, '1 phút'],
    [30_000, '1 phút'],
    [10 * MIN, '10 phút'],
    [59.6 * MIN, '1 giờ'],
    [3 * HOUR, '3 giờ'],
    [23.7 * HOUR, '1 ngày'],
    [DAY, '1 ngày'],
    [4.4 * DAY, '4 ngày'],
    [59 * DAY, '59 ngày'],
    [90 * DAY, '3 tháng'],
  ])('%d ms → %s', (ms, expected) => {
    expect(formatInterval(from, new Date(from.getTime() + ms))).toBe(expected)
  })
})
