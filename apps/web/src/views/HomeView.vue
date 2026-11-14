<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import WeeklyAccuracy from '../components/WeeklyAccuracy.vue'
import { useOnline } from '../composables/online.ts'
import { useAuthStore } from '../stores/auth.ts'
import { useDictationStore } from '../stores/dictation.ts'
import { useStatsStore } from '../stores/stats.ts'
import { useStudyStore } from '../stores/study.ts'

const auth = useAuthStore()
const stats = useStatsStore()
const study = useStudyStore()
const dictation = useDictationStore()
const router = useRouter()
const online = useOnline()

const overview = computed(() => stats.overview)
const total = computed(() =>
  overview.value ? overview.value.today.dueCount + overview.value.today.newCount : 0,
)
const pendingReviews = computed(() => study.pending.length)
const pendingAttempts = computed(() => dictation.pending.length)

const progress = computed(() => {
  const p = overview.value?.progress
  if (!p) return null
  const share = (n: number) => `${Math.min(100, (n / p.target) * 100)}%`
  return {
    ...p,
    gap: p.known - p.required,
    knownWidth: share(p.known),
    requiredAt: share(p.required),
  }
})
const number = (n: number) => n.toLocaleString('vi-VN')
/** '2027-02-01' → '01/02/2027' */
const dateVi = (date: string) => date.split('-').reverse().join('/')

async function load() {
  // Ratings and attempts made offline go first, so the numbers include them.
  await Promise.all([study.flush(), dictation.flush()])
  await stats.load()
}

async function resend() {
  await Promise.all([study.flush(), dictation.flush()])
  await stats.load()
}

onMounted(load)

async function logout() {
  await auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <main class="page home">
    <header class="topbar">
      <span class="muted email">{{ auth.user?.email }}</span>
      <nav class="topbar-links">
        <RouterLink to="/settings" class="link">Cài đặt</RouterLink>
        <button type="button" class="link" @click="logout">Đăng xuất</button>
      </nav>
    </header>

    <p v-if="!overview && stats.status !== 'error'" class="muted">Đang tải…</p>

    <section v-else-if="!overview" class="panel">
      <p class="error" role="alert">Không tải được số liệu.</p>
      <button type="button" @click="load">Thử lại</button>
    </section>

    <template v-else>
      <p v-if="stats.status === 'error'" class="notice" role="status">
        Không cập nhật được số liệu, đang hiện số liệu cũ.
        <button type="button" class="link" @click="load">Thử lại</button>
      </p>

      <section class="today">
        <h1>Hôm nay</h1>
        <div class="stats">
          <div class="stat">
            <strong>{{ overview.today.dueCount }}</strong>
            <span>thẻ đến hạn</span>
          </div>
          <div class="stat">
            <strong>{{ overview.today.newCount }}</strong>
            <span>từ mới</span>
          </div>
          <div class="stat">
            <strong>{{ overview.streak.current }}</strong>
            <span>ngày liên tiếp</span>
            <span v-if="!overview.streak.studiedToday && overview.streak.current > 0" class="small">
              Hôm nay chưa học
            </span>
          </div>
        </div>
        <RouterLink v-if="total > 0" to="/study" class="button primary">Bắt đầu học</RouterLink>
        <section v-else class="panel">
          <p>Hôm nay không còn thẻ nào để học.</p>
          <p class="muted">
            Nếu bạn chưa nạp từ vựng, hãy làm theo hướng dẫn trong
            <code>docs/content-importer.md</code>.
          </p>
        </section>
        <RouterLink to="/dictation" class="button secondary">Luyện nghe chép chính tả</RouterLink>
      </section>

      <section v-if="progress" class="panel goal">
        <h2>Mục tiêu {{ number(progress.target) }} từ trước {{ dateVi(progress.targetDate) }}</h2>
        <p class="hero">
          <strong>{{ number(progress.known) }}</strong>
          <span class="muted">/ {{ number(progress.target) }} từ đã thuộc</span>
        </p>
        <div
          class="meter"
          role="meter"
          :aria-valuenow="progress.known"
          aria-valuemin="0"
          :aria-valuemax="progress.target"
          :aria-label="`Đã thuộc ${progress.known} trên ${progress.target} từ; mức cần có hôm nay ${progress.required} từ`"
        >
          <div class="meter-fill" :style="{ width: progress.knownWidth }"></div>
          <div class="meter-mark" :style="{ left: progress.requiredAt }"></div>
        </div>
        <p class="meter-legend muted small">
          <span class="meter-mark-key" aria-hidden="true"></span>
          Mức cần có hôm nay: {{ number(progress.required) }} từ
        </p>
        <p class="pace">
          <template v-if="progress.gap > 0">
            <span class="status-icon good" aria-hidden="true">▲</span> Đi trước
            {{ number(progress.gap) }} từ
          </template>
          <template v-else-if="progress.gap < 0">
            <span class="status-icon behind" aria-hidden="true">▼</span> Đi sau
            {{ number(-progress.gap) }} từ
          </template>
          <template v-else>
            <span class="dot good" aria-hidden="true"></span> Đúng tiến độ
          </template>
        </p>
        <p v-if="progress.neededPerDay !== null" class="muted">
          Cần khoảng <strong>{{ progress.neededPerDay }}</strong> từ được thuộc mỗi ngày để kịp
          {{ dateVi(progress.targetDate) }}.
        </p>
        <p v-else-if="progress.known >= progress.target" class="muted">Đã đạt mục tiêu!</p>
        <p v-else class="muted">Đã qua mốc {{ dateVi(progress.targetDate) }}.</p>
        <p class="muted small">
          "Đã thuộc" là từ đã qua giai đoạn học ban đầu và chuyển sang ôn dài hạn.
        </p>
      </section>

      <WeeklyAccuracy :weeks="overview.dictationWeeks" />
    </template>

    <section class="panel sync" aria-live="polite">
      <p>
        <span :class="['dot', online ? 'good' : 'behind']" aria-hidden="true"></span>
        {{ online ? 'Đang online' : 'Đang offline' }}
      </p>
      <p v-if="pendingReviews + pendingAttempts > 0" class="muted">
        Đang chờ gửi: {{ pendingReviews }} lượt chấm, {{ pendingAttempts }} bài chép.
        <button type="button" class="link" @click="resend">Gửi lại</button>
      </p>
      <p v-else class="muted">Mọi kết quả đã được lưu.</p>
    </section>
  </main>
</template>
