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

  it('AUDIO_BASE_URL is optional, validated and stripped of a trailing slash', () => {
    expect(loadConfig(base).audioBaseUrl).toBeNull()
    expect(loadConfig({ ...base, AUDIO_BASE_URL: 'https://pub.r2.dev/' }).audioBaseUrl).toBe(
      'https://pub.r2.dev',
    )
    expect(() => loadConfig({ ...base, AUDIO_BASE_URL: 'not a url' })).toThrow(/AUDIO_BASE_URL/)
    expect(() => loadConfig({ ...base, AUDIO_BASE_URL: 'ftp://x.test' })).toThrow(/AUDIO_BASE_URL/)
  })
})
