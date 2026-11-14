<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth.ts'
import { useSettingsStore } from './stores/settings.ts'

const auth = useAuthStore()
const settings = useSettingsStore()
const route = useRoute()
const router = useRouter()

// The session can end while a page is open (expired cookie). Any request that gets a 401 clears
// the user; send them to log in and bring them back to where they were.
watch(
  () => auth.user,
  (user) => {
    // Settings belong to the logged-in user (audio speed is used on every page).
    if (user) void settings.load()
    else settings.reset()
    if (!user && auth.checked && route.meta.requiresAuth) {
      void router.replace({ path: '/login', query: { redirect: route.fullPath } })
    }
  },
  { immediate: true },
)
</script>

<template>
  <RouterView />
</template>
