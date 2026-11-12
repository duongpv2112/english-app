<script setup lang="ts">
import type { Rating } from '@english-app/shared'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.ts'
import { useStudyStore } from '../stores/study.ts'
import { currentItem } from '../study/session.ts'

const study = useStudyStore()
const auth = useAuthStore()
const router = useRouter()

const item = computed(() => (study.session ? currentItem(study.session) : undefined))
const remaining = computed(() => study.session?.queue.length ?? 0)

const ratings: { value: Rating; label: string; key: string }[] = [
  { value: 1, label: 'Quên', key: '1' },
  { value: 2, label: 'Khó', key: '2' },
  { value: 3, label: 'Được', key: '3' },
  { value: 4, label: 'Dễ', key: '4' },
]

watch(
  () => study.unauthenticated,
  async (yes) => {
    if (!yes) return
    auth.user = null
    await router.replace('/login?redirect=/study')
  },
)

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.repeat) return
  if (e.key === ' ' && !study.flipped) {
    e.preventDefault()
    study.flip()
    return
  }
  const r = ratings.find((x) => x.key === e.key)
  if (r && study.flipped) void study.rate(r.value)
}

onMounted(async () => {
  window.addEventListener('keydown', onKey)
  await study.loadToday()
  study.start()
})
onUnmounted(() => window.removeEventListener('keydown', onKey))
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

      <section v-else class="done">
        <h1>Xong rồi!</h1>
        <p>Bạn đã ôn {{ study.session.reviewed }} thẻ.</p>
        <button type="button" class="primary" @click="router.push('/')">Về trang chủ</button>
      </section>
    </template>
  </main>
</template>
