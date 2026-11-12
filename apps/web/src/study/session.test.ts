import { describe, expect, it } from 'vitest'
import {
  createSession,
  currentItem,
  formatWait,
  nextDueAt,
  rateCurrent,
  type Session,
} from './session.ts'
import { fakeCard, fakeToday } from './testCards.ts'

const now = new Date('2026-11-12T03:00:00Z')
let n = 0
const newId = () => `id-${++n}`
const order = (s: Session) => s.queue.map((i) => i.card.word.lemma)

describe('study session', () => {
  it('starts with the server order', () => {
    const s = createSession(fakeToday(['a', 'b', 'c'], now))
    expect(currentItem(s, now)?.card.word.lemma).toBe('a')
    expect(s.reviewed).toBe(0)
  })

  it('Again puts the card back after the other cards due now', () => {
    const s = createSession(fakeToday(['a', 'b', 'c'], now))
    const { session, review } = rateCurrent(s, 1, now, newId)
    expect(order(session)).toEqual(['b', 'c', 'a'])
    expect(review).toMatchObject({ cardId: 'card-a', rating: 1, reviewedAt: now.toISOString() })
    expect(review.id).toMatch(/^id-/)
  })

  it('Easy removes a new card from today session', () => {
    const s = createSession(fakeToday(['a', 'b'], now))
    const { session } = rateCurrent(s, 4, now, newId)
    expect(order(session)).toEqual(['b'])
    expect(session.reviewed).toBe(1)
  })

  it('a card due later today is placed by due time', () => {
    let s = createSession(fakeToday(['a', 'b', 'c'], now))
    s = rateCurrent(s, 1, now, newId).session
    s = rateCurrent(s, 3, now, newId).session
    expect(order(s)).toEqual(['c', 'a', 'b'])
  })

  it('does not show a learning card before its due time', () => {
    const s = rateCurrent(createSession(fakeToday(['a'], now)), 3, now, newId).session
    expect(s.queue).toHaveLength(1)
    expect(currentItem(s, now)).toBeUndefined()
    expect(nextDueAt(s)).toEqual(new Date(now.getTime() + 10 * 60_000))
    expect(currentItem(s, new Date(now.getTime() + 9 * 60_000))).toBeUndefined()
    expect(currentItem(s, new Date(now.getTime() + 10 * 60_000))?.card.word.lemma).toBe('a')
  })

  it('shows due new cards before a learning card that is not due yet', () => {
    const today = fakeToday(['b'], now)
    const learning = fakeCard('a', now)
    learning.isNew = false
    learning.state = {
      ...learning.state,
      state: 1,
      reps: 1,
      due: new Date(now.getTime() + 5 * 60_000).toISOString(),
    }
    const s = createSession({ ...today, cards: [learning, ...today.cards] })
    expect(currentItem(s, now)?.card.word.lemma).toBe('b')
    const after = rateCurrent(s, 4, now, newId).session
    expect(order(after)).toEqual(['a'])
  })

  it('nextDueAt is null for a finished session', () => {
    const s = rateCurrent(createSession(fakeToday(['a'], now)), 4, now, newId).session
    expect(nextDueAt(s)).toBeNull()
  })

  it('formatWait shows minutes and seconds, rounding up', () => {
    expect(formatWait(9 * 60_000 + 59_001)).toBe('10:00')
    expect(formatWait(65_000)).toBe('1:05')
    expect(formatWait(-5)).toBe('0:00')
  })

  it('does not mutate the old session', () => {
    const s = createSession(fakeToday(['a', 'b'], now))
    rateCurrent(s, 4, now, newId)
    expect(order(s)).toEqual(['a', 'b'])
    expect(s.reviewed).toBe(0)
  })

  it('throws when the session is finished', () => {
    const s = rateCurrent(createSession(fakeToday(['a'], now)), 4, now, newId).session
    expect(currentItem(s, now)).toBeUndefined()
    expect(() => rateCurrent(s, 3, now, newId)).toThrow()
  })
})
