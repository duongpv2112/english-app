<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth.ts'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// The session can end while a page is open (expired cookie). Any request that gets a 401 clears
// the user; send them to log in and bring them back to where they were.
watch(
  () => auth.user,
  (user) => {
    if (!user && auth.checked && route.meta.requiresAuth) {
      void router.replace({ path: '/login', query: { redirect: route.fullPath } })
    }
  },
)
</script>

<template>
  <RouterView />
</template>
