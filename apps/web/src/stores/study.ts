import {
  applyRating,
  isTypedCorrect,
  previewDue,
  type Rating,
  type ReviewBatchResponse,
  type ReviewInput,
  type StudyCard,
  type StudyTodayResponse,
  type StudyWord,
} from '@english-app/shared'
import { defineStore } from 'pinia'
import { api, ApiError } from '../api/client.ts'
import { formatInterval } from '../study/format.ts'
import { pendingReviews } from '../study/pending.ts'
import { requeue } from '../study/queue.ts'
import { useAuthStore } from './auth.ts'

/** The server accepts at most this many reviews per request. */
const BATCH_SIZE = 500

/** The request loop currently sending pending ratings for a store, if any. */
const inFlight = new WeakMap<object, Promise<void>>()

/** A 401 means the session ended; clearing the user lets the views send them to the login page. */
function noteIfLoggedOut(error: unknown) {
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') useAuthStore().user = null
}

export const useStudyStore = defineStore('study', {
  state: () => ({
    status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    /** Cards still to show in this session; the first one is on screen. */
    queue: [] as StudyCard[],
    dueCount: 0,
    newCount: 0,
    dayEndsAt: null as string | null,
    revealed: false,
    /** For a listen-and-type card: what was typed, and whether it was the word. Null until checked. */
    typedInput: '',
    typedCorrect: null as boolean | null,
    reviewedCount: 0,
    /** Ratings not yet confirmed by the server. */
    pending: pendingReviews.load(),
    /** The last attempt to send pending ratings failed. */
    syncError: false,
  }),
  getters: {
    current: (state): StudyCard | null => state.queue[0] ?? null,
    finished: (state): boolean => state.status === 'ready' && state.queue.length === 0,
    /** The rating a typed answer points to: Good when right, Again when wrong. Only a suggestion. */
    suggestedRating: (state): Rating | null =>
      state.typedCorrect === null ? null : state.typedCorrect ? 3 : 1,
    /** For the card on screen: how long until it returns, for each of the four ratings. */
    intervals(): Record<Rating, string> | null {
      const card = this.current
      if (!card) return null
      const now = new Date()
      const due = previewDue(card.state, now)
      return {
        1: formatInterval(now, new Date(due[1])),
        2: formatInterval(now, new Date(due[2])),
        3: formatInterval(now, new Date(due[3])),
        4: formatInterval(now, new Date(due[4])),
      }
    },
  },
  actions: {
    /** Fetches today's queue. Leftover ratings go first so the queue reflects them. */
    async load() {
      this.status = 'loading'
      await this.flush()
      try {
        const today = await api<StudyTodayResponse>('/study/today')
        this.queue = today.cards
        this.dueCount = today.dueCount
        this.newCount = today.newCount
        this.dayEndsAt = today.dayEndsAt
        this.revealed = false
        this.typedInput = ''
        this.typedCorrect = null
        this.status = 'ready'
      } catch (error) {
        noteIfLoggedOut(error)
        this.status = 'error'
      }
    },

    reveal() {
      if (this.current) this.revealed = true
    },

    /** Shows corrected content on every card of the word still in the session. */
    updateWord(word: StudyWord) {
      this.queue = this.queue.map((card) => (card.word.id === word.id ? { ...card, word } : card))
    },

    /** Checks the typed answer of a listen-and-type card and shows the card's back. */
    checkTyped(input: string) {
      const card = this.current
      if (!card || card.mode !== 'LISTEN_TYPE' || this.revealed) return
      this.typedInput = input.trim()
      this.typedCorrect = isTypedCorrect(card.word.lemma, input)
      this.revealed = true
    },

    /** Rates the card on screen, moves on, and sends the rating in the background. */
    rate(rating: Rating) {
      const card = this.current
      if (!card || !this.revealed || !this.dayEndsAt) return
      const reviewedAt = new Date()
      const state = applyRating(card.state, rating, reviewedAt)

      this.pending.push({
        id: crypto.randomUUID(),
        cardId: card.cardId,
        rating,
        reviewedAt: reviewedAt.toISOString(),
      })
      pendingReviews.save(this.pending)

      this.queue = requeue(
        this.queue.slice(1),
        { ...card, state },
        rating,
        new Date(this.dayEndsAt),
      )
      this.revealed = false
      this.typedInput = ''
      this.typedCorrect = null
      this.reviewedCount++
      void this.flush()
    },

    /** Sends pending ratings, one request at a time, until none are left or a request fails. */
    flush(): Promise<void> {
      // Callers that arrive mid-flight share the running loop, which also picks up their ratings.
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
          await api<ReviewBatchResponse>('/reviews/batch', {
            method: 'POST',
            body: { reviews: batch },
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
        const sent = new Set(batch.map((r: ReviewInput) => r.id))
        this.pending = this.pending.filter((r) => !sent.has(r.id))
        pendingReviews.save(this.pending)
      }
      this.syncError = false
    },
  },
})
