import { studyTodayResponseSchema, type Rating, type StudyTodayResponse } from '@english-app/shared'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { api, ApiError } from '../api/client.ts'
import { ReviewSync, sendReviews } from '../study/reviewSync.ts'
import { createSession, currentItem, rateCurrent, type Session } from '../study/session.ts'

export const useStudyStore = defineStore('study', () => {
  const today = ref<StudyTodayResponse | null>(null)
  const session = shallowRef<Session | null>(null)
  const flipped = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const pendingCount = ref(0)
  // Set when the server says the session expired; the view sends the user to /login.
  const unauthenticated = ref(false)
  const sync = new ReviewSync(sendReviews)

  async function loadToday() {
    loading.value = true
    error.value = null
    unauthenticated.value = false
    // Never show yesterday's (or the last session's) counts while the new ones load.
    today.value = null
    try {
      today.value = studyTodayResponseSchema.parse(await api('/study/today'))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) unauthenticated.value = true
      else error.value = 'Không tải được bài học hôm nay. Thử lại sau.'
    } finally {
      loading.value = false
    }
  }

  function start() {
    session.value = today.value ? createSession(today.value) : null
    flipped.value = false
  }

  function flip() {
    if (session.value && currentItem(session.value)) flipped.value = true
  }

  async function syncNow() {
    try {
      await sync.flush()
      error.value = null
      unauthenticated.value = false
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) unauthenticated.value = true
      else {
        error.value = `Chưa gửi được ${sync.pending.length} lượt chấm. Sẽ thử lại ở lần chấm sau.`
      }
    } finally {
      pendingCount.value = sync.pending.length
    }
  }

  async function rate(rating: Rating) {
    if (!session.value || !flipped.value || !currentItem(session.value)) return
    const result = rateCurrent(session.value, rating, new Date(), () => crypto.randomUUID())
    session.value = result.session
    flipped.value = false
    sync.add(result.review)
    pendingCount.value = sync.pending.length
    await syncNow()
  }

  return {
    today,
    session,
    flipped,
    loading,
    error,
    pendingCount,
    unauthenticated,
    loadToday,
    start,
    flip,
    rate,
    retrySync: syncNow,
  }
})
