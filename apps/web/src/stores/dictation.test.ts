import type { DictationAttemptInput, DictationItem } from '@english-app/shared'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pendingAttempts } from '../study/pending.ts'
import { useDictationStore } from './dictation.ts'

const now = new Date('2026-11-14T03:00:00.000Z')

const item = (n: number, textEn: string): DictationItem => ({
  exampleId: `ex${n}`,
  wordId: `word${n}`,
  lemma: `w${n}`,
  textEn,
  textVi: `dịch ${n}`,
  audioUrl: `https://cdn.test/${n}.mp3`,
})
const two = [item(1, 'Please send the invoice.'), item(2, 'The budget is ready.')]

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

type Call = { method: string; url: string; body: { attempts: DictationAttemptInput[] } | undefined }

function stubServer(items: DictationItem[] | 'fail', post: () => Response | Promise<Response>) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET'
      calls.push({ method, url, body: init.body ? JSON.parse(String(init.body)) : undefined })
      if (method === 'POST') return post()
      if (items === 'fail') throw new TypeError('Failed to fetch')
      return json(200, { items })
    }),
  )
  return calls
}

const ok = () => json(200, { applied: 1, duplicates: 0, rejected: [], results: [] })
const offline = () => {
  throw new TypeError('Failed to fetch')
}
const posts = (calls: Call[]) => calls.filter((c) => c.method === 'POST')
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('dictation store', () => {
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

  it('load fetches the session', async () => {
    const calls = stubServer(two, ok)
    const store = useDictationStore()
    await store.load()
    expect(calls[0]!.url).toBe('/api/dictation/session')
    expect(store.status).toBe('ready')
    expect(store.current?.exampleId).toBe('ex1')
    expect(store.finished).toBe(false)
    expect(store.average).toBeNull()
  })

  it('an empty session is finished, not an error', async () => {
    stubServer([], ok)
    const store = useDictationStore()
    await store.load()
    expect(store.status).toBe('ready')
    expect(store.current).toBeNull()
    expect(store.finished).toBe(true)
  })

  it('load failure sets status error', async () => {
    stubServer('fail', ok)
    const store = useDictationStore()
    await store.load()
    expect(store.status).toBe('error')
  })

  it('submit grades locally, shows the result and sends the attempt', async () => {
    const calls = stubServer(two, ok)
    const store = useDictationStore()
    await store.load()
    store.submit('please send the invoices')
    expect(store.result?.score).toBe(0.75)
    expect(store.result?.diff.at(-1)).toEqual({
      type: 'wrong',
      expected: 'invoice',
      actual: 'invoices',
    })
    await settle()
    const sent = posts(calls)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.url).toBe('/api/dictation/attempts/batch')
    expect(sent[0]!.body!.attempts).toEqual([
      {
        id: expect.any(String),
        exampleId: 'ex1',
        input: 'please send the invoices',
        createdAt: now.toISOString(),
      },
    ])
    expect(store.pending).toEqual([])
  })

  it('submit twice for the same sentence is ignored', async () => {
    const calls = stubServer(two, ok)
    const store = useDictationStore()
    await store.load()
    store.submit('a')
    store.submit('please send the invoice')
    await settle()
    expect(store.result?.score).toBe(0)
    expect(posts(calls)[0]!.body!.attempts).toHaveLength(1)
  })

  it('next moves on and clears the result; the last next finishes with an average', async () => {
    stubServer(two, ok)
    const store = useDictationStore()
    await store.load()
    store.next() // nothing submitted yet
    expect(store.index).toBe(0)
    store.submit('please send the invoice')
    store.next()
    expect(store.current?.exampleId).toBe('ex2')
    expect(store.result).toBeNull()
    store.submit('the budget')
    store.next()
    expect(store.finished).toBe(true)
    expect(store.current).toBeNull()
    expect(store.average).toBe(0.75)
  })

  it('load starts a fresh session', async () => {
    stubServer(two, ok)
    const store = useDictationStore()
    await store.load()
    store.submit('x')
    store.next()
    await store.load()
    expect([store.index, store.scores, store.result]).toEqual([0, [], null])
  })

  it('a failed send keeps the attempt pending and in localStorage', async () => {
    stubServer(two, offline)
    const store = useDictationStore()
    await store.load()
    store.submit('please')
    await settle()
    expect(store.pending).toHaveLength(1)
    expect(store.syncError).toBe(true)
    expect(pendingAttempts.load()).toEqual(store.pending)
    // The result is still shown.
    expect(store.result?.score).toBe(0.25)
  })

  it('pending attempts from a previous visit are sent on load', async () => {
    const left: DictationAttemptInput = {
      id: '3f2b8c1e-5d47-4a9b-8e21-0c6f7a9d1b23',
      exampleId: 'ex9',
      input: 'old',
      createdAt: '2026-11-13T03:00:00.000Z',
    }
    pendingAttempts.save([left])
    const calls = stubServer(two, ok)
    const store = useDictationStore()
    await store.load()
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET'])
    expect(calls[0]!.body!.attempts).toEqual([left])
    expect(store.pending).toEqual([])
    expect(pendingAttempts.load()).toEqual([])
  })

  it('a 400 response drops the batch', async () => {
    stubServer(two, () => json(400, { error: { code: 'VALIDATION_ERROR', message: 'x' } }))
    const store = useDictationStore()
    await store.load()
    store.submit('x')
    await settle()
    expect(store.pending).toEqual([])
  })
})
