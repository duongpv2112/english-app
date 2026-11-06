<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.ts'

const auth = useAuthStore()
const router = useRouter()

async function logout() {
  await auth.logout()
  await router.replace('/login')
}
</script>

<template>
  <main class="card">
    <h1>Xin chào, {{ auth.user?.email }}</h1>
    <button type="button" @click="logout">Đăng xuất</button>
  </main>
</template>
