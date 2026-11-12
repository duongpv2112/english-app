import { reviewSchema } from '@english-app/shared'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../api/client.ts'
import { currentItem } from '../study/session.ts'
import { fakeToday } from '../study/testCards.ts'
import { useStudyStore } from './study.ts'

vi.mock('../api/client.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client.ts')>()),
  api: vi.fn(),
}))
const apiMock = vi.mocked(api)

const now = new Date()

async function startedStore() {
  apiMock.mockResolvedValueOnce(fakeToday(['a', 'b'], now))
  const store = useStudyStore()
  await store.loadToday()
  store.start()
  return store
}

describe('study store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    apiMock.mockReset()
  })

  it('loadToday stores the parsed queue', async () => {
    const store = await startedStore()
    expect(apiMock).toHaveBeenCalledWith('/study/today')
    expect(store.today?.cards).toHaveLength(2)
    expect(currentItem(store.session!)?.card.word.lemma).toBe('a')
  })

  it('loadToday drops the previous queue while reloading', async () => {
    const store = await startedStore()
    let resolve!: (v: unknown) => void
    apiMock.mockReturnValueOnce(new Promise((r) => (resolve = r)))
    const loading = store.loadToday()
    expect(store.today).toBeNull()
    resolve(fakeToday([], now))
    await loading
    expect(store.today?.cards).toEqual([])
  })

  it('loadToday reports an error for a malformed response', async () => {
    apiMock.mockResolvedValueOnce({ nope: true })
    const store = useStudyStore()
    await store.loadToday()
    expect(store.today).toBeNull()
    expect(store.error).toBe('Không tải được bài học hôm nay. Thử lại sau.')
  })

  it('rate moves to the next card, unflips and sends the review', async () => {
    const store = await startedStore()
    apiMock.mockResolvedValueOnce({ accepted: 1, duplicates: 0 })
    store.flip()
    await store.rate(4)
    expect(store.flipped).toBe(false)
    expect(currentItem(store.session!)?.card.word.lemma).toBe('b')
    const [path, init] = apiMock.mock.calls.at(-1)!
    expect(path).toBe('/reviews/batch')
    const body = init?.body as { reviews: unknown[] }
    expect(body.reviews).toHaveLength(1)
    expect(() => reviewSchema.parse(body.reviews[0])).not.toThrow()
    expect(store.pendingCount).toBe(0)
  })

  it('ignores a rating before the card is flipped', async () => {
    const store = await startedStore()
    await store.rate(3)
    expect(currentItem(store.session!)?.card.word.lemma).toBe('a')
    expect(apiMock).toHaveBeenCalledTimes(1)
  })

  it('shows the pending count when sending fails, and retrySync sends it', async () => {
    const store = await startedStore()
    apiMock.mockRejectedValueOnce(new ApiError('INTERNAL_ERROR', 500, 'boom'))
    store.flip()
    await store.rate(3)
    expect(store.pendingCount).toBe(1)
    expect(store.error).toBe('Chưa gửi được 1 lượt chấm. Sẽ thử lại ở lần chấm sau.')
    apiMock.mockResolvedValueOnce({ accepted: 1, duplicates: 0 })
    await store.retrySync()
    expect(store.pendingCount).toBe(0)
    expect(store.error).toBeNull()
  })

  it('flags unauthenticated on 401 and keeps the review', async () => {
    const store = await startedStore()
    apiMock.mockRejectedValueOnce(new ApiError('UNAUTHENTICATED', 401, 'Not logged in'))
    store.flip()
    await store.rate(3)
    expect(store.unauthenticated).toBe(true)
    expect(store.pendingCount).toBe(1)
  })
})
