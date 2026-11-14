import type { Settings } from '@english-app/shared'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client.ts'
import { useSettingsStore } from './settings.ts'

const defaults: Settings = { newPerDay: 20, timezone: 'Asia/Ho_Chi_Minh', playbackRate: 1 }

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function stubServer(patchStatus = 200) {
  const calls: { method: string; body: unknown }[] = []
  let current = { ...defaults }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      const body = init.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ method, body })
      if (method === 'PATCH') {
        if (patchStatus !== 200) {
          return json(patchStatus, { error: { code: 'VALIDATION_ERROR', message: 'x' } })
        }
        current = { ...current, ...body }
      }
      return json(200, current)
    }),
  )
  return calls
}

describe('settings store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  it('playbackRate defaults to 1 before loading', () => {
    expect(useSettingsStore().playbackRate).toBe(1)
  })

  it('load fetches settings once', async () => {
    const calls = stubServer()
    const store = useSettingsStore()
    await store.load()
    await store.load()
    expect(calls).toHaveLength(1)
    expect(store.settings).toEqual(defaults)
    expect(store.status).toBe('ready')
    await store.load(true)
    expect(calls).toHaveLength(2)
  })

  it('save sends only the patch and stores the result', async () => {
    const calls = stubServer()
    const store = useSettingsStore()
    await store.load()
    await store.save({ playbackRate: 0.9 })
    expect(calls[1]).toEqual({ method: 'PATCH', body: { playbackRate: 0.9 } })
    expect(store.settings?.playbackRate).toBe(0.9)
    expect(store.playbackRate).toBe(0.9)
  })

  it('save rejects on a server error and keeps the old settings', async () => {
    stubServer(400)
    const store = useSettingsStore()
    await store.load()
    await expect(store.save({ newPerDay: 5 })).rejects.toBeInstanceOf(ApiError)
    expect(store.settings).toEqual(defaults)
  })
})
