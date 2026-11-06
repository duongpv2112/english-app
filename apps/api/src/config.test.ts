import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

const base = { DATABASE_URL: 'postgres://x', SESSION_SECRET: 'a'.repeat(64) }

describe('loadConfig', () => {
  it('parses valid env', () => {
    const c = loadConfig(base)
    expect(c.port).toBe(3000)
    expect(c.sessionSecret.length).toBe(32)
    expect(c.webDistDir).toBeNull()
  })

  it('rejects missing SESSION_SECRET', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgres://x' })).toThrow(/SESSION_SECRET/)
  })

  it('rejects non-hex SESSION_SECRET', () => {
    expect(() => loadConfig({ ...base, SESSION_SECRET: 'z'.repeat(64) })).toThrow(/SESSION_SECRET/)
  })
})
