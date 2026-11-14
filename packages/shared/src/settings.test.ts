import { describe, expect, it } from 'vitest'
import { settingsPatchSchema, settingsSchema } from './settings.ts'

const valid = { newPerDay: 20, timezone: 'Asia/Ho_Chi_Minh', playbackRate: 1 }

describe('settings schemas', () => {
  it('accepts valid settings', () => {
    expect(settingsSchema.safeParse(valid).success).toBe(true)
    expect(settingsSchema.safeParse({ ...valid, newPerDay: 0, playbackRate: 0.5 }).success).toBe(
      true,
    )
  })

  it.each([
    { newPerDay: 101 },
    { newPerDay: -1 },
    { newPerDay: 1.5 },
    { timezone: 'Mars/Base' },
    { timezone: '+07:00' },
    { playbackRate: 1.6 },
    { playbackRate: 0.4 },
  ])('rejects %j', (bad) => {
    expect(settingsSchema.safeParse({ ...valid, ...bad }).success).toBe(false)
    expect(settingsPatchSchema.safeParse(bad).success).toBe(false)
  })

  it('a patch needs at least one field', () => {
    expect(settingsPatchSchema.safeParse({}).success).toBe(false)
    expect(settingsPatchSchema.safeParse({ newPerDay: 10 }).success).toBe(true)
  })
})
