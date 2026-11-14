<script setup lang="ts">
import type { SettingsPatch } from '@english-app/shared'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ApiError } from '../api/client.ts'
import { useSettingsStore } from '../stores/settings.ts'

const store = useSettingsStore()

const RATES = [0.75, 0.9, 1, 1.1, 1.25]
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone

const form = reactive({ newPerDay: 20, timezone: '', playbackRate: 1 })
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const saving = ref(false)

// Fill the form whenever fresh settings arrive.
watch(
  () => store.settings,
  (settings) => {
    if (settings) Object.assign(form, settings)
  },
  { immediate: true },
)

/** Every zone the browser knows, plus the saved and the device zone (aliases may be missing). */
const zones = computed(() =>
  [...new Set([...Intl.supportedValuesOf('timeZone'), form.timezone, deviceZone])]
    .filter(Boolean)
    .sort(),
)
const rates = computed(() => [...new Set([...RATES, form.playbackRate])].sort((a, b) => a - b))

const patch = computed((): SettingsPatch | null => {
  const saved = store.settings
  if (!saved) return null
  const changes: SettingsPatch = {}
  if (form.newPerDay !== saved.newPerDay) changes.newPerDay = form.newPerDay
  if (form.timezone !== saved.timezone) changes.timezone = form.timezone
  if (form.playbackRate !== saved.playbackRate) changes.playbackRate = form.playbackRate
  return Object.keys(changes).length > 0 ? changes : null
})

async function save() {
  if (!patch.value || saving.value) return
  saving.value = true
  message.value = null
  try {
    await store.save(patch.value)
    message.value = { kind: 'ok', text: 'Đã lưu.' }
  } catch (e) {
    message.value = {
      kind: 'error',
      text:
        e instanceof ApiError && e.code === 'VALIDATION_ERROR'
          ? 'Số từ mới phải từ 0 tới 100.'
          : 'Không lưu được. Kiểm tra kết nối rồi thử lại.',
    }
  } finally {
    saving.value = false
  }
}

onMounted(() => store.load(true))
</script>

<template>
  <main class="page">
    <header class="topbar">
      <RouterLink to="/" class="link">← Trang chủ</RouterLink>
    </header>

    <h1>Cài đặt</h1>

    <p v-if="!store.settings && store.status !== 'error'" class="muted">Đang tải…</p>
    <section v-else-if="!store.settings" class="panel">
      <p class="error" role="alert">Không tải được cài đặt.</p>
      <button type="button" @click="store.load(true)">Thử lại</button>
    </section>

    <form v-else class="panel settings" @submit.prevent="save">
      <label>
        Số từ mới mỗi ngày
        <input v-model.number="form.newPerDay" type="number" min="0" max="100" step="1" required />
        <span class="muted small">Áp dụng từ lần mở hàng đợi tiếp theo.</span>
      </label>

      <label>
        Múi giờ
        <select v-model="form.timezone">
          <option v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</option>
        </select>
        <span class="muted small">Ngày học bắt đầu lúc 0 giờ theo múi giờ này.</span>
      </label>
      <button
        v-if="deviceZone && deviceZone !== form.timezone"
        type="button"
        class="link"
        @click="form.timezone = deviceZone"
      >
        Dùng múi giờ của máy này ({{ deviceZone }})
      </button>

      <label>
        Tốc độ phát audio
        <select v-model.number="form.playbackRate">
          <option v-for="rate in rates" :key="rate" :value="rate">{{ rate }}x</option>
        </select>
      </label>

      <p
        v-if="message"
        :class="message.kind === 'ok' ? 'saved' : 'error'"
        :role="message.kind === 'ok' ? 'status' : 'alert'"
      >
        {{ message.text }}
      </p>
      <button type="submit" class="primary" :disabled="!patch || saving">
        {{ saving ? 'Đang lưu…' : 'Lưu' }}
      </button>
    </form>
  </main>
</template>
