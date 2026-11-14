import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { useOnline } from './online.ts'

describe('useOnline', () => {
  it('follows online and offline events, and stops listening when disposed', () => {
    const scope = effectScope()
    const online = scope.run(() => useOnline())!
    expect(online.value).toBe(navigator.onLine)
    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(false)
    window.dispatchEvent(new Event('online'))
    expect(online.value).toBe(true)
    scope.stop()
    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(true)
  })
})
