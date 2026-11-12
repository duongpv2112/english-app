import { describe, expect, it } from 'vitest'
import { parseArgs, requireEnv, UsageError } from './args.ts'

describe('parseArgs', () => {
  it.each([
    [['import-tsl', 'tsl.csv'], { name: 'import-tsl', file: 'tsl.csv' }],
    [['enrich', '--limit', '200'], { name: 'enrich', limit: 200 }],
    [['tts'], { name: 'tts', limit: undefined }],
    [['report'], { name: 'report', format: 'md', out: 'report.md', limit: undefined }],
    [
      ['report', '--format', 'csv'],
      { name: 'report', format: 'csv', out: 'report.csv', limit: undefined },
    ],
    [
      ['report', '--out', 'x.md', '--limit', '5'],
      { name: 'report', format: 'md', out: 'x.md', limit: 5 },
    ],
  ])('parses %j', (argv, expected) => {
    expect(parseArgs(argv)).toEqual(expected)
  })

  it.each([
    [[]],
    [['nope']],
    [['import-tsl']],
    [['enrich', '--limit', '0']],
    [['enrich', '--limit', 'x']],
    [['enrich', '--limit', '1.5']],
    [['report', '--format', 'pdf']],
    [['tts', '--bogus']],
  ])('rejects %j with usage', (argv) => {
    expect(() => parseArgs(argv)).toThrow(UsageError)
    expect(() => parseArgs(argv)).toThrow(/import-tsl <file\.csv>/)
  })
})

describe('requireEnv', () => {
  it('returns the requested variables', () => {
    expect(requireEnv({ A: 'x', B: 'y', C: 'z' }, ['A', 'B'])).toEqual({ A: 'x', B: 'y' })
  })

  it('names every missing variable', () => {
    expect(() => requireEnv({ A: 'x', B: '' }, ['A', 'B', 'C'])).toThrow(/B, C/)
  })
})
