<script setup lang="ts">
import type { Rating } from '@english-app/shared'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { goToLogin } from '../auth/sessionExpired.ts'
import { useStudyStore } from '../stores/study.ts'
import { keyAction } from '../study/keys.ts'
import { currentItem, formatWait, nextDueAt } from '../study/session.ts'

const study = useStudyStore()
const router = useRouter()

// Ticks every second so a waiting learning card appears when its step is over.
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined

// Refresh right after each rating so the countdown starts from the real remaining time.
watch(
  () => study.session,
  () => (now.value = Date.now()),
)

const item = computed(() =>
  study.session ? currentItem(study.session, new Date(now.value)) : undefined,
)
const waitText = computed(() => {
  const next = study.session ? nextDueAt(study.session) : null
  return next ? formatWait(next.getTime() - now.value) : null
})
const remaining = computed(() => study.session?.queue.length ?? 0)

const ratings: { value: Rating; label: string }[] = [
  { value: 1, label: 'Quên' },
  { value: 2, label: 'Khó' },
  { value: 3, label: 'Được' },
  { value: 4, label: 'Dễ' },
]

watch(
  () => study.unauthenticated,
  async (yes) => {
    if (yes) await goToLogin(router, '/study')
  },
)

function onKey(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, select, [contenteditable]')) return
  const action = keyAction(e, study.flipped)
  if (!action) return
  e.preventDefault()
  if (action.type === 'flip') study.flip()
  else void study.rate(action.rating)
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  timer = setInterval(() => (now.value = Date.now()), 1000)
  await study.loadToday()
  study.start()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  clearInterval(timer)
})
</script>

<template>
  <main class="card study">
    <p v-if="study.loading && !study.session">Đang tải…</p>
    <p v-else-if="study.error && !study.session" class="error">{{ study.error }}</p>

    <template v-else-if="study.session">
      <div class="study-top">
        <span>Còn {{ remaining }} thẻ</span>
        <span v-if="study.pendingCount > 0" class="pending">
          {{ study.error ?? `Đang gửi ${study.pendingCount} lượt chấm…` }}
          <button type="button" class="link" @click="study.retrySync()">Gửi lại</button>
        </span>
      </div>

      <section v-if="item" class="flashcard">
        <h1 class="lemma">{{ item.card.word.lemma }}</h1>
        <p class="ipa">{{ item.card.word.ipa }} · {{ item.card.word.pos }}</p>

        <template v-if="study.flipped">
          <p class="meaning">{{ item.card.word.meaningVi }}</p>
          <ul class="examples">
            <li v-for="ex in item.card.word.examples" :key="ex.id">
              <span>{{ ex.textEn }}</span>
              <small>{{ ex.textVi }}</small>
            </li>
          </ul>
          <div class="ratings">
            <button
              v-for="r in ratings"
              :key="r.value"
              type="button"
              :class="`rate-${r.value}`"
              @click="study.rate(r.value)"
            >
              {{ r.label }}
            </button>
          </div>
        </template>
        <button v-else type="button" class="primary" @click="study.flip()">Lật thẻ</button>
      </section>

      <section v-else-if="waitText" class="done">
        <h1>Nghỉ một chút</h1>
        <p>Thẻ tiếp theo sau {{ waitText }}</p>
        <button type="button" class="secondary" @click="router.push('/')">Về trang chủ</button>
      </section>

      <section v-else class="done">
        <h1>Xong rồi!</h1>
        <p>Bạn đã ôn {{ study.session.reviewed }} thẻ.</p>
        <button type="button" class="primary" @click="router.push('/')">Về trang chủ</button>
      </section>
    </template>
  </main>
</template>
