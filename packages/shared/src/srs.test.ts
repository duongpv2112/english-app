import { describe, expect, it } from 'vitest'
import { applyRating, newCardState, replayReviews } from './srs.ts'

const t0 = new Date('2026-11-12T01:00:00Z')

describe('srs', () => {
  it('a new card is New and due now', () => {
    expect(newCardState(t0)).toMatchObject({
      state: 0,
      reps: 0,
      lapses: 0,
      due: t0,
      lastReview: null,
    })
  })

  it('Good on a new card goes to Learning, due in 10 minutes', () => {
    const c = applyRating(newCardState(t0), 3, t0)
    expect(c).toMatchObject({ state: 1, reps: 1, lastReview: t0 })
    expect(c.due).toEqual(new Date('2026-11-12T01:10:00Z'))
  })

  it('Again on a new card is due in 1 minute', () => {
    expect(applyRating(newCardState(t0), 1, t0).due).toEqual(new Date('2026-11-12T01:01:00Z'))
  })

  it('Easy on a new card goes straight to Review, due at least a day later', () => {
    const c = applyRating(newCardState(t0), 4, t0)
    expect(c.state).toBe(2)
    expect(c.due.getTime() - t0.getTime()).toBeGreaterThanOrEqual(24 * 3600_000)
  })

  it('is deterministic', () => {
    expect(applyRating(newCardState(t0), 3, t0)).toEqual(applyRating(newCardState(t0), 3, t0))
  })

  it('does not mutate its input', () => {
    const c = newCardState(t0)
    applyRating(c, 3, t0)
    expect(c).toEqual(newCardState(t0))
  })

  it('replayReviews sorts by time and equals applying in order', () => {
    const t1 = new Date('2026-11-12T01:10:00Z')
    const inOrder = applyRating(applyRating(newCardState(t0), 3, t0), 3, t1)
    expect(
      replayReviews([
        { rating: 3, reviewedAt: t1 },
        { rating: 3, reviewedAt: t0 },
      ]),
    ).toEqual(inOrder)
  })

  it('replayReviews throws on an empty list', () => {
    expect(() => replayReviews([])).toThrow()
  })
})
