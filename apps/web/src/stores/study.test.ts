import type { ReviewInput, StudyTodayResponse } from '@english-app/shared'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pendingReviews } from '../study/pending.ts'
import { fakeCard } from '../test/cards.ts'
import { useStudyStore } from './study.ts'

const now = new Date('2026-11-12T03:00:00.000Z')

function today(count: number): StudyTodayResponse {
  return {
    cards: Array.from({ length: count }, (_, i) => fakeCard(i + 1, now)),
    dueCount: 0,
    newCount: count,
    dayEndsAt: '2026-11-12T17:00:00.000Z',
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Call = { method: string; url: string; body: { reviews: ReviewInput[] } | undefined }

/** Stubs fetch. `post` decides how POST /api/reviews/batch responds. */
function stubServer(queue: StudyTodayResponse | 'fail', post: () => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined })
      if (method === 'POST') return post()
      if (queue === 'fail') throw new TypeError('Failed to fetch')
      return json(200, queue)
    }),
  )
  return calls
}

const ok = () => json(200, { applied: 1, duplicates: 0, rejected: [], cards: [] })
const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST')
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('study store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(now)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('load fetches the queue', async () => {
    stubServer(today(2), ok)
    const store = useStudyStore()
    await store.load()
    expect(store.status).toBe('ready')
    expect(store.queue.map((c) => c.cardId)).toEqual(['1', '2'])
    expect([store.dueCount, store.newCount]).toEqual([0, 2])
    expect(store.current?.cardId).toBe('1')
    expect(store.finished).toBe(false)
  })

  it('load with no cards is finished, not an error', async () => {
    stubServer(today(0), ok)
    const store = useStudyStore()
    await store.load()
    expect(store.status).toBe('ready')
    expect(store.current).toBeNull()
    expect(store.finished).toBe(true)
  })

  it('load failure sets status error', async () => {
    stubServer('fail', ok)
    const store = useStudyStore()
    await store.load()
    expect(store.status).toBe('error')
    expect(store.finished).toBe(false)
  })

  it('rate does nothing until the card is revealed', async () => {
    const calls = stubServer(today(2), ok)
    const store = useStudyStore()
    await store.load()
    store.rate(3)
    expect(store.current?.cardId).toBe('1')
    expect(posts(calls)).toHaveLength(0)
  })

  it('rate sends the review and advances to the next card', async () => {
    const calls = stubServer(today(2), ok)
    const store = useStudyStore()
    await store.load()
    store.reveal()
    expect(store.revealed).toBe(true)
    store.rate(3)
    await settle()

    expect(store.current?.cardId).toBe('2')
    expect(store.revealed).toBe(false)
    expect(store.reviewedCount).toBe(1)
    // Good on a new card is a 10-minute learning step, so it comes back at the end.
    expect(store.queue.map((c) => c.cardId)).toEqual(['2', '1'])
    expect(store.queue[1]).toMatchObject({ isNew: false, state: { state: 1, reps: 1 } })

    const sent = posts(calls)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe('/api/reviews/batch')
    expect(sent[0]!.body!.reviews).toEqual([
      { id: expect.any(String), cardId: '1', rating: 3, reviewedAt: now.toISOString() },
    ])
    expect(store.pending).toEqual([])
    expect(pendingReviews.load()).toEqual([])
    expect(store.syncError).toBe(false)
  })

  it('Easy removes the card from the session', async () => {
    stubServer(today(2), ok)
    const store = useStudyStore()
    await store.load()
    store.reveal()
    store.rate(4)
    store.reveal()
    store.rate(4)
    await settle()
    expect(store.queue).toEqual([])
    expect(store.finished).toBe(true)
    expect(store.reviewedCount).toBe(2)
  })

  it('a failed send keeps the review pending and in localStorage', async () => {
    stubServer(today(2), () => {
      throw new TypeError('Failed to fetch')
    })
    const store = useStudyStore()
    await store.load()
    store.reveal()
    store.rate(3)
    await settle()
    expect(store.pending).toHaveLength(1)
    expect(store.syncError).toBe(true)
    expect(pendingReviews.load()).toEqual(store.pending)
    // The session carries on regardless.
    expect(store.current?.cardId).toBe('2')
  })

  it('a later flush sends everything that is still pending', async () => {
    let online = false
    const calls = stubServer(today(2), () => {
      if (!online) throw new TypeError('Failed to fetch')
      return ok()
    })
    const store = useStudyStore()
    await store.load()
    store.reveal()
    store.rate(3)
    await settle()
    store.reveal()
    store.rate(3)
    await settle()
    expect(store.pending).toHaveLength(2)

    online = true
    await store.flush()
    expect(store.pending).toEqual([])
    expect(store.syncError).toBe(false)
    expect(
      posts(calls)
        .at(-1)!
        .body!.reviews.map((r) => r.cardId),
    ).toEqual(['1', '2'])
  })

  it('pending reviews from a previous visit are sent on load', async () => {
    const left: ReviewInput = {
      id: '3f2b8c1e-5d47-4a9b-8e21-0c6f7a9d1b23',
      cardId: '9',
      rating: 3,
      reviewedAt: '2026-11-11T03:00:00.000Z',
    }
    pendingReviews.save([left])
    const calls = stubServer(today(1), ok)
    const store = useStudyStore()
    expect(store.pending).toEqual([left])
    await store.load()
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET'])
    expect(calls[0]!.body!.reviews).toEqual([left])
    expect(store.pending).toEqual([])
    expect(pendingReviews.load()).toEqual([])
  })

  it('a 400 response drops the batch', async () => {
    stubServer(today(2), () =>
      json(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid input' } }),
    )
    const store = useStudyStore()
    await store.load()
    store.reveal()
    store.rate(3)
    await settle()
    expect(store.pending).toEqual([])
    expect(pendingReviews.load()).toEqual([])
  })

  it('ignores corrupt data in localStorage', () => {
    localStorage.setItem('english-app:pending-reviews', '{not json')
    expect(pendingReviews.load()).toEqual([])
    localStorage.setItem('english-app:pending-reviews', '[{"id":"x"}]')
    expect(pendingReviews.load()).toEqual([])
  })

  it('intervals labels the four buttons for the current card', async () => {
    stubServer(today(1), ok)
    const store = useStudyStore()
    expect(store.intervals).toBeNull()
    await store.load()
    expect(store.intervals).toMatchObject({ 1: '1 phút', 2: '6 phút', 3: '10 phút' })
    expect(store.intervals![4]).toMatch(/^\d+ ngày$/)
  })

  describe('listen-and-type cards', () => {
    const listenFirst = (): StudyTodayResponse => ({
      ...today(2),
      cards: [fakeCard(1, now, 'LISTEN_TYPE'), fakeCard(2, now)],
    })

    it('checkTyped with the right word reveals the card and suggests Good', async () => {
      stubServer(listenFirst(), ok)
      const store = useStudyStore()
      await store.load()
      expect(store.suggestedRating).toBeNull()
      store.checkTyped(' W1 ')
      expect(store.revealed).toBe(true)
      expect(store.typedCorrect).toBe(true)
      expect(store.suggestedRating).toBe(3)
    })

    it('checkTyped with a wrong word suggests Again, and any rating can still be chosen', async () => {
      const calls = stubServer(listenFirst(), ok)
      const store = useStudyStore()
      await store.load()
      store.checkTyped('w9')
      expect(store.typedCorrect).toBe(false)
      expect(store.suggestedRating).toBe(1)
      store.rate(3)
      await settle()
      expect(posts(calls)[0]!.body!.reviews[0]).toMatchObject({ cardId: '1', rating: 3 })
    })

    it('checkTyped does nothing on a RECOGNIZE card', async () => {
      stubServer(today(1), ok)
      const store = useStudyStore()
      await store.load()
      store.checkTyped('w1')
      expect(store.revealed).toBe(false)
      expect(store.typedCorrect).toBeNull()
    })

    it('typedCorrect resets on the next card', async () => {
      stubServer(listenFirst(), ok)
      const store = useStudyStore()
      await store.load()
      store.checkTyped('w1')
      store.rate(3)
      expect(store.typedCorrect).toBeNull()
      expect(store.suggestedRating).toBeNull()
    })
  })

  it('updateWord replaces the word on every queued card of that word', async () => {
    const listen = fakeCard(1, now, 'LISTEN_TYPE')
    const recognise = { ...fakeCard(2, now), word: listen.word }
    stubServer({ ...today(3), cards: [listen, fakeCard(3, now), recognise] }, ok)
    const store = useStudyStore()
    await store.load()
    store.updateWord({ ...listen.word, meaningVi: 'nghĩa mới' })
    expect(store.queue.map((c) => c.word.meaningVi)).toEqual(['nghĩa mới', 'nghĩa 3', 'nghĩa mới'])
  })
})
