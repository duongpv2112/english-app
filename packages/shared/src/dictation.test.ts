import { describe, expect, it } from 'vitest'
import {
  dictationBatchRequestSchema,
  gradeDictation,
  isTypedCorrect,
  keyWordMissed,
  normalizeWords,
} from './dictation.ts'

describe('gradeDictation', () => {
  it('ignores case, punctuation and extra spaces', () => {
    expect(gradeDictation('Please send the invoice.', '  please   SEND the invoice ').score).toBe(1)
  })

  it.each([
    ["I don't know.", 'i do not know'],
    ["I'm late.", 'I am late'],
    ['We will not go.', "we won't go"],
    ["It's ready.", 'it is ready'],
    ['They’re here.', "they're here"],
    ["Let's start.", 'let us start'],
    ['He cannot come.', "he can't come"],
    ["We've finished and she'll call.", 'we have finished and she will call'],
    ["I'd like that.", 'I would like that'],
  ])('treats %s and %s as the same', (a, b) => {
    expect(gradeDictation(a, b).score).toBe(1)
    expect(gradeDictation(b, a).score).toBe(1)
  })

  it('marks a wrong word', () => {
    expect(gradeDictation('send the invoice', 'send the invoices')).toEqual({
      score: 2 / 3,
      diff: [
        { type: 'correct', expected: 'send', actual: 'send' },
        { type: 'correct', expected: 'the', actual: 'the' },
        { type: 'wrong', expected: 'invoice', actual: 'invoices' },
      ],
    })
  })

  it('marks missing and extra words', () => {
    expect(gradeDictation('please send the invoice', 'send me the invoice')).toEqual({
      score: 3 / 4,
      diff: [
        { type: 'missing', expected: 'please', actual: null },
        { type: 'correct', expected: 'send', actual: 'send' },
        { type: 'extra', expected: null, actual: 'me' },
        { type: 'correct', expected: 'the', actual: 'the' },
        { type: 'correct', expected: 'invoice', actual: 'invoice' },
      ],
    })
  })

  it('pairs words in a mismatched stretch, then reports the leftovers', () => {
    const { diff, score } = gradeDictation('the new manager starts today', 'the knew today')
    expect(diff.map((d) => d.type)).toEqual(['correct', 'wrong', 'missing', 'missing', 'correct'])
    expect(score).toBe(2 / 5)
  })

  it('empty or punctuation-only input scores 0 with every word missing', () => {
    for (const input of ['', '   ', '...!?']) {
      const { score, diff } = gradeDictation('Send it now.', input)
      expect(score).toBe(0)
      expect(diff.map((d) => d.type)).toEqual(['missing', 'missing', 'missing'])
    }
  })

  it('empty expected text scores 0', () => {
    expect(gradeDictation('', 'anything')).toEqual({
      score: 0,
      diff: [{ type: 'extra', expected: null, actual: 'anything' }],
    })
    expect(gradeDictation('', '')).toEqual({ score: 0, diff: [] })
  })

  it('keeps a possessive as one word', () => {
    expect(normalizeWords("The company's plan")).toEqual(['the', "company's", 'plan'])
  })

  it('handles hyphens, numbers and quotes', () => {
    expect(normalizeWords('A well-known, 24-hour service!')).toEqual([
      'a',
      'well',
      'known',
      '24',
      'hour',
      'service',
    ])
    expect(normalizeWords("He said 'yes' — twice.")).toEqual(['he', 'said', 'yes', 'twice'])
  })
})

describe('isTypedCorrect', () => {
  it('ignores case and surrounding spaces', () => {
    expect(isTypedCorrect('invoice', '  Invoice ')).toBe(true)
    expect(isTypedCorrect('invoice', 'invoices')).toBe(false)
    expect(isTypedCorrect('invoice', '')).toBe(false)
  })
})

describe('keyWordMissed', () => {
  const missed = (lemma: string, expected: string, input: string) =>
    keyWordMissed(lemma, gradeDictation(expected, input).diff)

  it('finds inflected forms', () => {
    expect(missed('invoice', 'the invoices are late', 'the invoices are late')).toBe(false)
    expect(missed('invoice', 'the invoices are late', 'the invoice are late')).toBe(true)
    expect(missed('invoice', 'the invoices are late', 'the are late')).toBe(true)
    expect(missed('apply', 'she applied today', 'she supplied today')).toBe(true)
    expect(missed('manage', 'he is managing it', 'he is managing it')).toBe(false)
  })

  it('other mistakes do not count', () => {
    expect(missed('invoice', 'send the invoice today', 'send a invoice')).toBe(false)
  })

  it('returns null when the word is not found in the sentence', () => {
    expect(missed('send', 'he sent it', 'he sent it')).toBeNull()
  })
})

describe('dictation schemas', () => {
  const attempt = {
    id: '3f2b8c1e-5d47-4a9b-8e21-0c6f7a9d1b23',
    exampleId: 'ex1',
    input: 'hello',
    createdAt: '2026-11-14T03:00:00.000Z',
  }

  it('accepts a valid batch, including an empty input', () => {
    expect(dictationBatchRequestSchema.safeParse({ attempts: [attempt] }).success).toBe(true)
    expect(
      dictationBatchRequestSchema.safeParse({ attempts: [{ ...attempt, input: '' }] }).success,
    ).toBe(true)
  })

  it('rejects a 501-character input and a 101-attempt batch', () => {
    const long = { ...attempt, input: 'a'.repeat(501) }
    expect(dictationBatchRequestSchema.safeParse({ attempts: [long] }).success).toBe(false)
    const many = Array.from({ length: 101 }, () => attempt)
    expect(dictationBatchRequestSchema.safeParse({ attempts: many }).success).toBe(false)
    expect(dictationBatchRequestSchema.safeParse({ attempts: [] }).success).toBe(false)
  })
})
