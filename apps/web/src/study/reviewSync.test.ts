import type { Review } from '@english-app/shared'
import { describe, expect, it, vi } from 'vitest'
import { ReviewSync } from './reviewSync.ts'

const r = (id: string): Review => ({
  id,
  cardId: 'c',
  rating: 3,
  reviewedAt: '2026-11-12T03:00:00.000Z',
})

function deferred() {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('ReviewSync', () => {
  it('sends pending reviews and clears them on success', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const sync = new ReviewSync(send)
    sync.add(r('1'))
    sync.add(r('2'))
    await sync.flush()
    expect(send).toHaveBeenCalledWith([r('1'), r('2')])
    expect(sync.pending).toEqual([])
  })

  it('keeps reviews when sending fails and resends them next time', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    const sync = new ReviewSync(send)
    sync.add(r('1'))
    await expect(sync.flush()).rejects.toThrow('offline')
    expect(sync.pending).toEqual([r('1')])
    sync.add(r('2'))
    await sync.flush()
    expect(send).toHaveBeenLastCalledWith([r('1'), r('2')])
    expect(sync.pending).toEqual([])
  })

  it('keeps a review added while a send is in flight', async () => {
    const d = deferred()
    const sync = new ReviewSync(() => d.promise)
    sync.add(r('1'))
    const flushing = sync.flush()
    sync.add(r('2'))
    d.resolve()
    await flushing
    expect(sync.pending).toEqual([r('2')])
  })

  it('does not run two sends at once', async () => {
    let running = 0
    let maxRunning = 0
    const sends: Review[][] = []
    const sync = new ReviewSync(async (reviews) => {
      sends.push(reviews)
      running++
      maxRunning = Math.max(maxRunning, running)
      await new Promise((res) => setTimeout(res, 5))
      running--
    })
    sync.add(r('1'))
    const a = sync.flush()
    sync.add(r('2'))
    const b = sync.flush()
    await Promise.all([a, b])
    expect(maxRunning).toBe(1)
    expect(sends).toEqual([[r('1')], [r('2')]])
    expect(sync.pending).toEqual([])
  })
})
