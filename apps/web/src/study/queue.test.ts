import { applyRating, type Rating, type StudyCard } from '@english-app/shared'
import { describe, expect, it } from 'vitest'
import { fakeCard } from '../test/cards.ts'
import { requeue } from './queue.ts'

const now = new Date('2026-11-12T03:00:00.000Z')
const dayEnd = new Date('2026-11-12T17:00:00.000Z')
const [c1, c2, c3, c4, c5] = [1, 2, 3, 4, 5].map((n) => fakeCard(n, now)) as [
  StudyCard,
  StudyCard,
  StudyCard,
  StudyCard,
  StudyCard,
]
const rated = (card: StudyCard, rating: Rating): StudyCard => ({
  ...card,
  state: applyRating(card.state, rating, now),
})
const ids = (cards: StudyCard[]) => cards.map((c) => c.cardId)

describe('requeue', () => {
  it('Again reinserts the card 3 places later', () => {
    expect(ids(requeue([c2, c3, c4, c5], rated(c1, 1), 1, dayEnd))).toEqual([
      '2',
      '3',
      '4',
      '1',
      '5',
    ])
  })

  it('Again with a short queue goes to the end', () => {
    expect(ids(requeue([c2], rated(c1, 1), 1, dayEnd))).toEqual(['2', '1'])
    expect(ids(requeue([], rated(c1, 1), 1, dayEnd))).toEqual(['1'])
  })

  it('a learning step later today goes to the end', () => {
    expect(ids(requeue([c2, c3, c4, c5], rated(c1, 3), 3, dayEnd))).toEqual([
      '2',
      '3',
      '4',
      '5',
      '1',
    ])
  })

  it('a card due tomorrow or later leaves the session', () => {
    expect(ids(requeue([c2, c3], rated(c1, 4), 4, dayEnd))).toEqual(['2', '3'])
  })

  it('a card due exactly at the end of the day leaves the session', () => {
    const atBoundary = { ...c1, state: { ...c1.state, due: dayEnd.toISOString() } }
    expect(ids(requeue([c2], atBoundary, 3, dayEnd))).toEqual(['2'])
  })

  it('a requeued card is no longer new and does not change the input', () => {
    const rest = [c2, c3]
    const out = requeue(rest, rated(c1, 3), 3, dayEnd)
    expect(out.at(-1)).toMatchObject({ cardId: '1', isNew: false })
    expect(ids(rest)).toEqual(['2', '3'])
  })
})
