import { describe, expect, it } from 'vitest'
import { wordPatchSchema } from './words.ts'

describe('wordPatchSchema', () => {
  it('trims fields', () => {
    expect(
      wordPatchSchema.parse({
        meaningVi: '  hóa đơn ',
        examples: [{ id: 'e1', textEn: ' Hi. ' }],
      }),
    ).toEqual({ meaningVi: 'hóa đơn', examples: [{ id: 'e1', textEn: 'Hi.' }] })
  })

  it.each([
    { meaningVi: '   ' },
    { ipa: '' },
    { examples: [] },
    { examples: [{ id: 'e1', textVi: '' }] },
    { examples: [{ id: '', textEn: 'x' }] },
    { meaningVi: 'x'.repeat(301) },
  ])('rejects %j', (bad) => {
    expect(wordPatchSchema.safeParse(bad).success).toBe(false)
  })

  it('a patch needs at least one field', () => {
    expect(wordPatchSchema.safeParse({}).success).toBe(false)
  })
})
