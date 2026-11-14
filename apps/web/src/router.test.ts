import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './router.ts'
import { useAuthStore } from './stores/auth.ts'

describe('router auth guard', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('redirects to /login with redirect param when unauthenticated', async () => {
    const auth = useAuthStore()
    vi.spyOn(auth, 'fetchMe').mockImplementation(async () => {
      auth.user = null
      auth.checked = true
    })
    const router = createAppRouter(createMemoryHistory())
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/')
  })

  it('redirects /login → / when already authenticated', async () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'me@mail.com' }
    auth.checked = true
    const router = createAppRouter(createMemoryHistory())
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('checks the session only once', async () => {
    const auth = useAuthStore()
    const spy = vi.spyOn(auth, 'fetchMe').mockImplementation(async () => {
      auth.user = { id: '1', email: 'me@mail.com' }
      auth.checked = true
    })
    const router = createAppRouter(createMemoryHistory())
    await router.push('/')
    await router.push('/login')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('goes to /login when the session check fails with a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    try {
      const router = createAppRouter(createMemoryHistory())
      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/login')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('/study requires login', async () => {
    const auth = useAuthStore()
    auth.user = null
    auth.checked = true
    const router = createAppRouter(createMemoryHistory())
    await router.push('/study')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/study')
  })

  it('/dictation requires login', async () => {
    const auth = useAuthStore()
    auth.user = null
    auth.checked = true
    const router = createAppRouter(createMemoryHistory())
    await router.push('/dictation')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/dictation')
  })
})
