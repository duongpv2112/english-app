<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  /** Address of the audio file; nothing is rendered without one. */
  url: string | null
  /** Accessible name of the button, e.g. "Nghe từ". */
  label: string
  /** Start playing as soon as the audio is shown. */
  autoplay?: boolean
}>()

const failed = ref(false)
let audio: HTMLAudioElement | null = null

function stop() {
  audio?.pause()
  audio = null
}

async function play(byUser: boolean) {
  if (!props.url) return
  stop()
  failed.value = false
  const player = new Audio(props.url)
  audio = player
  player.addEventListener('error', () => {
    if (audio === player) failed.value = true
  })
  try {
    await player.play()
  } catch (error) {
    // Browsers refuse to autoplay before the first tap; the button still works, so stay quiet.
    const blocked = error instanceof DOMException && error.name === 'NotAllowedError'
    const interrupted = error instanceof DOMException && error.name === 'AbortError'
    if (audio === player && !interrupted && (byUser || !blocked)) failed.value = true
  }
}

watch(
  () => props.url,
  () => {
    stop()
    failed.value = false
    if (props.autoplay) void play(false)
  },
  { immediate: true },
)
onBeforeUnmount(stop)
</script>

<template>
  <span v-if="url" class="audio">
    <button type="button" class="audio-button" :aria-label="label" @click="play(true)">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"
        />
      </svg>
    </button>
    <span v-if="failed" class="audio-failed" role="status">Không phát được âm thanh</span>
  </span>
</template>
