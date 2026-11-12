import type { Router } from 'vue-router'
import { useAuthStore } from '../stores/auth.ts'

/** After a 401: forget the user (so the /login guard does not bounce back) and go to /login. */
export async function goToLogin(router: Router, redirect: string) {
  useAuthStore().user = null
  await router.replace({ path: '/login', query: { redirect } })
}
