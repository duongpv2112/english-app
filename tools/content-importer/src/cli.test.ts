import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDb, testDatabaseUrl, testDb } from '../test/db.ts'
import { main, requireEnv } from './cli.ts'

const db = testDb()

describe('requireEnv', () => {
  it('lists every missing variable', () => {
    expect(() => requireEnv({ DATABASE_URL: '' }, ['DATABASE_URL', 'ANTHROPIC_API_KEY'])).toThrow(
      'Missing environment variables: DATABASE_URL, ANTHROPIC_API_KEY',
    )
  })

  it('returns the values when all are set', () => {
    expect(requireEnv({ A: '1', B: '2' }, ['A'])).toEqual({ A: '1' })
  })
})

describe('main', () => {
  let stderr: ReturnType<typeof vi.spyOn>
  const dir = mkdtempSync(join(tmpdir(), 'importer-cli-'))
  const env = () => ({ DATABASE_URL: testDatabaseUrl() })

  beforeEach(async () => {
    await resetDb(db)
    stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())
  afterAll(() => db.$disconnect())

  const errors = () => stderr.mock.calls.flat().join('\n')

  it('returns 1 and names the variable when ANTHROPIC_API_KEY is missing', async () => {
    expect(await main(['enrich'], { DATABASE_URL: 'postgres://x' })).toBe(1)
    expect(errors()).toContain('ANTHROPIC_API_KEY')
  })

  it('returns 1 with usage for an unknown command', async () => {
    expect(await main(['tts'], {})).toBe(1)
    expect(errors()).toContain('import-tsl')
  })

  it('returns 1 with usage when import-tsl has no file', async () => {
    expect(await main(['import-tsl'], env())).toBe(1)
    expect(errors()).toContain('import-tsl <csv>')
  })

  it('runs import-tsl end to end', async () => {
    const csv = join(dir, 'tsl.csv')
    writeFileSync(csv, 'word\ninvoice\nbudget\n')
    expect(await main(['import-tsl', csv], env())).toBe(0)
    expect(await db.word.count()).toBe(2)
  })

  it('resolves a relative CSV path against the directory pnpm was started from', async () => {
    writeFileSync(join(dir, 'rel.csv'), 'word\ninvoice\n')
    expect(await main(['import-tsl', 'rel.csv'], { ...env(), INIT_CWD: dir })).toBe(0)
    expect(await db.word.count()).toBe(1)
  })

  it('prints rank conflicts', async () => {
    const csv = join(dir, 'conflict.csv')
    writeFileSync(csv, 'word\ninvoice\n')
    await main(['import-tsl', csv], env())
    writeFileSync(csv, 'word\nbudget\n')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await main(['import-tsl', csv], env())).toBe(0)
    const out = log.mock.calls.flat().join('\n')
    expect(out).toContain('rank conflicts 1')
    expect(out).toContain('budget (rank 1, taken by invoice)')
  })

  it('writes the report to --out', async () => {
    const out = join(dir, 'report.md')
    expect(await main(['report', '--out', out], env())).toBe(0)
    expect(readFileSync(out, 'utf8')).toContain('# Content report')
  })

  it('returns 1 for an invalid --since date', async () => {
    expect(await main(['report', '--since', 'yesterday'], env())).toBe(1)
    expect(errors()).toMatch(/since/i)
  })
})
