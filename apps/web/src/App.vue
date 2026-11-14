<script setup lang="ts">
import { watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useOnline } from './composables/online.ts'
import { useAuthStore } from './stores/auth.ts'
import { useDictationStore } from './stores/dictation.ts'
import { useSettingsStore } from './stores/settings.ts'
import { useStudyStore } from './stores/study.ts'

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

// Back online: send whatever was rated or typed while the connection was down.
const online = useOnline()
const study = useStudyStore()
const dictation = useDictationStore()
watch(online, (isOnline) => {
  if (isOnline && auth.user) {
    void study.flush()
    void dictation.flush()
  }
})
</script>

<template>
  <RouterView />
</template>
