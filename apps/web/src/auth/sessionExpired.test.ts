import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../router.ts'
import { useAuthStore } from '../stores/auth.ts'
import { goToLogin } from './sessionExpired.ts'

describe('goToLogin', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('lands on /login even though the user was logged in', async () => {
    const auth = useAuthStore()
    auth.user = { id: '1', email: 'me@mail.com' }
    auth.checked = true
    const router = createAppRouter(createMemoryHistory())
    await router.push('/')
    await goToLogin(router, '/')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/')
    expect(auth.user).toBeNull()
  })
})
