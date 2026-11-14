import type { StatsOverview } from '@english-app/shared'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStatsStore } from './stats.ts'

const overview: StatsOverview = {
  today: { dueCount: 3, newCount: 20 },
  streak: { current: 2, studiedToday: false },
  progress: { known: 40, target: 1200, required: 175, targetDate: '2027-02-01', neededPerDay: 15 },
  dictationWeeks: [{ weekStart: '2026-11-09', average: 0.8, attempts: 5 }],
}

describe('stats store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  it('load fetches the overview', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(overview), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const store = useStatsStore()
    await store.load()
    expect(fetch).toHaveBeenCalledWith('/api/stats/overview', expect.anything())
    expect(store.status).toBe('ready')
    expect(store.overview).toEqual(overview)
  })

  it('load failure sets status error and keeps what was shown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(overview))),
    )
    const store = useStatsStore()
    await store.load()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await store.load()
    expect(store.status).toBe('error')
    expect(store.overview).toEqual(overview)
  })
})
