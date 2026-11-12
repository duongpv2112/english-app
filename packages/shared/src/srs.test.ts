import { describe, expect, it } from 'vitest'
import {
  applyRating,
  newCardState,
  previewDue,
  replayReviews,
  type CardState,
  type Rating,
} from './srs.ts'

const t0 = new Date('2026-01-01T00:00:00.000Z')
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000)
const days = (n: number) => minutes(n * 24 * 60)

function reviewCard(): CardState {
  return applyRating(applyRating(newCardState(t0), 3, t0), 3, minutes(10))
}

describe('srs', () => {
  it('new card is due now in state New', () => {
    expect(newCardState(t0)).toMatchObject({
      state: 0,
      reps: 0,
      lapses: 0,
      due: t0.toISOString(),
      lastReview: null,
    })
  })

  it('Good on a new card enters learning, due in 10 minutes', () => {
    expect(applyRating(newCardState(t0), 3, t0)).toMatchObject({
      state: 1,
      reps: 1,
      due: '2026-01-01T00:10:00.000Z',
      lastReview: t0.toISOString(),
    })
  })

  it('Again on a new card is due in 1 minute', () => {
    expect(applyRating(newCardState(t0), 1, t0).due).toBe('2026-01-01T00:01:00.000Z')
  })

  it('a second Good graduates to Review, due in whole days', () => {
    const s = reviewCard()
    expect(s.state).toBe(2)
    expect(s.scheduledDays).toBeGreaterThanOrEqual(1)
    expect(new Date(s.due).getTime()).toBeGreaterThanOrEqual(days(1).getTime())
  })

  it('Easy on a new card goes straight to Review', () => {
    expect(applyRating(newCardState(t0), 4, t0).state).toBe(2)
  })

  it('Again on a Review card counts a lapse and enters Relearning', () => {
    const s = applyRating(reviewCard(), 1, days(3))
    expect(s).toMatchObject({ state: 3, lapses: 1 })
  })

  it('does not mutate its input and is deterministic', () => {
    const start = newCardState(t0)
    const copy = structuredClone(start)
    const a = applyRating(start, 3, t0)
    const b = applyRating(start, 3, t0)
    expect(start).toEqual(copy)
    expect(a).toEqual(b)
  })

  it('survives a JSON round trip between steps', () => {
    const direct = applyRating(applyRating(newCardState(t0), 3, t0), 3, minutes(10))
    const viaJson = applyRating(
      JSON.parse(JSON.stringify(applyRating(newCardState(t0), 3, t0))) as CardState,
      3,
      minutes(10),
    )
    expect(viaJson).toEqual(direct)
  })

  it('replayReviews equals applying the ratings one by one', () => {
    const history: { rating: Rating; reviewedAt: Date }[] = [
      { rating: 1, reviewedAt: t0 },
      { rating: 3, reviewedAt: minutes(1) },
      { rating: 3, reviewedAt: minutes(11) },
      { rating: 2, reviewedAt: days(3) },
    ]
    let expected = newCardState(t0)
    for (const h of history) expected = applyRating(expected, h.rating, h.reviewedAt)
    expect(replayReviews(t0, history)).toEqual(expected)
    expect(replayReviews(t0, [])).toEqual(newCardState(t0))
  })

  it('previewDue matches applyRating for every rating', () => {
    const state = reviewCard()
    const preview = previewDue(state, days(3))
    for (const rating of [1, 2, 3, 4] as const) {
      expect(preview[rating]).toBe(applyRating(state, rating, days(3)).due)
    }
  })
})
