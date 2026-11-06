<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ApiError } from '../api/client.ts'
import { useAuthStore } from '../stores/auth.ts'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const messages: Partial<Record<string, string>> = {
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng',
  RATE_LIMITED: 'Bạn thử quá nhiều lần. Thử lại sau 1 phút',
  VALIDATION_ERROR: 'Vui lòng nhập email hợp lệ và mật khẩu',
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await auth.login({ email: email.value, password: password.value })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/')
  } catch (e) {
    error.value =
      (e instanceof ApiError && messages[e.code]) || 'Không kết nối được máy chủ, thử lại sau'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="card">
    <h1>Đăng nhập</h1>
    <form @submit.prevent="submit">
      <label>
        Email
        <input v-model="email" type="email" autocomplete="username" required />
      </label>
      <label>
        Mật khẩu
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="loading">
        {{ loading ? 'Đang đăng nhập…' : 'Đăng nhập' }}
      </button>
    </form>
  </main>
</template>
