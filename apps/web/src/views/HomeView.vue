<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.ts'
import { useStudyStore } from '../stores/study.ts'

const auth = useAuthStore()
const study = useStudyStore()
const router = useRouter()

const total = computed(() => study.dueCount + study.newCount)

onMounted(() => study.load())

async function logout() {
  await auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <main class="page">
    <header class="topbar">
      <span class="muted">{{ auth.user?.email }}</span>
      <button type="button" class="link" @click="logout">Đăng xuất</button>
    </header>

    <h1>Hôm nay</h1>

    <p v-if="study.status === 'loading' || study.status === 'idle'" class="muted">Đang tải…</p>

    <section v-else-if="study.status === 'error'" class="panel">
      <p class="error" role="alert">Không tải được danh sách thẻ hôm nay.</p>
      <button type="button" @click="study.load()">Thử lại</button>
    </section>

    <template v-else>
      <section class="stats">
        <div class="stat">
          <strong>{{ study.dueCount }}</strong>
          <span>thẻ đến hạn</span>
        </div>
        <div class="stat">
          <strong>{{ study.newCount }}</strong>
          <span>từ mới</span>
        </div>
      </section>

      <RouterLink v-if="total > 0" to="/study" class="button primary">Bắt đầu học</RouterLink>
      <section v-else class="panel">
        <p>Hôm nay không còn thẻ nào để học.</p>
        <p class="muted">
          Nếu bạn chưa nạp từ vựng, hãy làm theo hướng dẫn trong
          <code>docs/content-importer.md</code>.
        </p>
      </section>
    </template>

    <p v-if="study.pending.length > 0" class="notice" role="status">
      {{ study.pending.length }} lượt chấm chưa lưu lên máy chủ.
      <button type="button" class="link" @click="study.flush()">Thử lại</button>
    </p>
  </main>
</template>
