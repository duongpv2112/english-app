import { describe, expect, it } from 'vitest'
import { reviewBatchRequestSchema } from './study.ts'

const valid = {
  id: '3f2b8c1e-5d47-4a9b-8e21-0c6f7a9d1b23',
  cardId: 'card1',
  rating: 3,
  reviewedAt: '2026-11-12T03:00:00.000Z',
}
const batch = (review: unknown) => reviewBatchRequestSchema.safeParse({ reviews: [review] })

describe('reviewBatchRequestSchema', () => {
  it('accepts a valid review batch', () => {
    expect(batch(valid).success).toBe(true)
  })

  it.each([
    ['rating 5', { ...valid, rating: 5 }],
    ['rating 0', { ...valid, rating: 0 }],
    ['id not a uuid', { ...valid, id: 'abc' }],
    ['reviewedAt not a datetime', { ...valid, reviewedAt: 'yesterday' }],
    ['empty cardId', { ...valid, cardId: '' }],
  ])('rejects %s', (_name, review) => {
    expect(batch(review).success).toBe(false)
  })

  it('rejects empty and oversized batches', () => {
    expect(reviewBatchRequestSchema.safeParse({ reviews: [] }).success).toBe(false)
    const many = Array.from({ length: 501 }, () => valid)
    expect(reviewBatchRequestSchema.safeParse({ reviews: many }).success).toBe(false)
    expect(reviewBatchRequestSchema.safeParse({ reviews: many.slice(0, 500) }).success).toBe(true)
  })
})
