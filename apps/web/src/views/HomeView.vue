<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { goToLogin } from '../auth/sessionExpired.ts'
import { useAuthStore } from '../stores/auth.ts'
import { useStudyStore } from '../stores/study.ts'

const auth = useAuthStore()
const study = useStudyStore()
const router = useRouter()

const total = computed(() => (study.today ? study.today.dueCount + study.today.newCount : 0))

onMounted(async () => {
  await study.loadToday()
  if (study.unauthenticated) await goToLogin(router, '/')
})

async function logout() {
  await auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <main class="card">
    <h1>Xin chào, {{ auth.user?.email }}</h1>
    <p v-if="study.loading && !study.today">Đang tải…</p>
    <p v-else-if="study.error" class="error">{{ study.error }}</p>
    <template v-else-if="study.today">
      <p class="counts">
        Đến hạn: <strong>{{ study.today.dueCount }}</strong> · Từ mới:
        <strong>{{ study.today.newCount }}</strong>
      </p>
      <p v-if="total === 0">Hôm nay đã học xong 🎉</p>
      <button type="button" class="primary" :disabled="total === 0" @click="router.push('/study')">
        Học
      </button>
    </template>
    <button type="button" class="secondary" @click="logout">Đăng xuất</button>
  </main>
</template>
