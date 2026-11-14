import {
  gradeDictation,
  type DictationBatchResponse,
  type DictationItem,
  type DictationSessionResponse,
  type DiffToken,
} from '@english-app/shared'
import { defineStore } from 'pinia'
import { api, ApiError } from '../api/client.ts'
import { pendingAttempts } from '../study/pending.ts'
import { useAuthStore } from './auth.ts'

/** The server accepts at most this many attempts per request. */
const BATCH_SIZE = 100

/** The request loop currently sending pending attempts for a store, if any. */
const inFlight = new WeakMap<object, Promise<void>>()

function noteIfLoggedOut(error: unknown) {
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') useAuthStore().user = null
}

export const useDictationStore = defineStore('dictation', {
  state: () => ({
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    items: [] as DictationItem[],
    /** Position of the sentence on screen. */
    index: 0,
    /** Grading of the sentence on screen, once it has been submitted. */
    result: null as { score: number; diff: DiffToken[] } | null,
    /** Scores of the sentences submitted in this session. */
    scores: [] as number[],
    /** Attempts not yet confirmed by the server. */
    pending: pendingAttempts.load(),
    syncError: false,
  }),
  getters: {
    current: (state): DictationItem | null => state.items[state.index] ?? null,
    finished: (state): boolean => state.status === 'ready' && state.index >= state.items.length,
    average: (state): number | null =>
      state.scores.length === 0
        ? null
        : state.scores.reduce((sum, score) => sum + score, 0) / state.scores.length,
  },
  actions: {
    /** Starts a new session. Leftover attempts go first so the sentence choice reflects them. */
    async load() {
      this.status = 'loading'
      await this.flush()
      try {
        const session = await api<DictationSessionResponse>('/dictation/session')
        this.items = session.items
        this.index = 0
        this.result = null
        this.scores = []
        this.status = 'ready'
      } catch (error) {
        noteIfLoggedOut(error)
        this.status = 'error'
      }
    },

    /** Grades what was typed for the sentence on screen and sends it in the background. */
    submit(input: string) {
      const item = this.current
      if (!item || this.result) return
      // Graded here for an instant result; the server grades again with the same rules.
      this.result = gradeDictation(item.textEn, input)
      this.scores.push(this.result.score)
      this.pending.push({
        id: crypto.randomUUID(),
        exampleId: item.exampleId,
        input: input.slice(0, 500),
        createdAt: new Date().toISOString(),
      })
      pendingAttempts.save(this.pending)
      void this.flush()
    },

    next() {
      if (!this.result) return
      this.result = null
      this.index++
    },

    /** Sends pending attempts, one request at a time, until none are left or a request fails. */
    flush(): Promise<void> {
      const running = inFlight.get(this)
      if (running) return running
      const run = this.sendPending().finally(() => inFlight.delete(this))
      inFlight.set(this, run)
      return run
    },

    async sendPending() {
      while (this.pending.length > 0) {
        const batch = this.pending.slice(0, BATCH_SIZE)
        try {
          await api<DictationBatchResponse>('/dictation/attempts/batch', {
            method: 'POST',
            body: { attempts: batch },
          })
        } catch (error) {
          // A 400 will never be accepted however often it is retried, so let the batch go.
          const unusable = error instanceof ApiError && error.status === 400
          if (!unusable) {
            noteIfLoggedOut(error)
            this.syncError = true
            return
          }
        }
        const sent = new Set(batch.map((a) => a.id))
        this.pending = this.pending.filter((a) => !sent.has(a.id))
        pendingAttempts.save(this.pending)
      }
      this.syncError = false
    },
  },
})
