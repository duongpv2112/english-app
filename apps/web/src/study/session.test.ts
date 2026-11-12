import { describe, expect, it } from 'vitest'
import { createSession, currentItem, rateCurrent, type Session } from './session.ts'
import { fakeToday } from './testCards.ts'

const now = new Date('2026-11-12T03:00:00Z')
let n = 0
const newId = () => `id-${++n}`
const order = (s: Session) => s.queue.map((i) => i.card.word.lemma)

describe('study session', () => {
  it('starts with the server order', () => {
    const s = createSession(fakeToday(['a', 'b', 'c'], now))
    expect(currentItem(s)?.card.word.lemma).toBe('a')
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

  it('does not mutate the old session', () => {
    const s = createSession(fakeToday(['a', 'b'], now))
    rateCurrent(s, 4, now, newId)
    expect(order(s)).toEqual(['a', 'b'])
    expect(s.reviewed).toBe(0)
  })

  it('throws when the session is finished', () => {
    const s = rateCurrent(createSession(fakeToday(['a'], now)), 4, now, newId).session
    expect(currentItem(s)).toBeUndefined()
    expect(() => rateCurrent(s, 3, now, newId)).toThrow()
  })
})
