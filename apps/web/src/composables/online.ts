import { onScopeDispose, ref, type Ref } from 'vue'

/** Whether the browser thinks it has a network connection, kept up to date. */
export function useOnline(): Ref<boolean> {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const up = () => (online.value = true)
  const down = () => (online.value = false)
  window.addEventListener('online', up)
  window.addEventListener('offline', down)
  onScopeDispose(() => {
    window.removeEventListener('online', up)
    window.removeEventListener('offline', down)
  })
  return online
}
